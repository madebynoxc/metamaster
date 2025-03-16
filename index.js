import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import sagiri from 'sagiri';
import dotenv from 'dotenv';
import { gql, GraphQLClient } from 'graphql-request';

dotenv.config();
const SAUCENAO_API_KEY = process.env.SAUCENAO_API_KEY;

const SHIMMIE_ENDPOINT = process.env.SHIMMIE_ENDPOINT;
const GRAPHQL_ENDPOINT = `${SHIMMIE_ENDPOINT}/graphql`;
const SHIMMIE_LOGIN = process.env.SHIMMIE_LOGIN;
const SHIMMIE_PASSWORD = process.env.SHIMMIE_PASSWORD;

const CHIBISAFE_UPLOAD_URL = process.env.CHIBISAFE_UPLOAD_URL;
const CHIBISAFE_API_KEY = process.env.CHIBISAFE_API_KEY;

const DANBOORU_URL = process.env.DANBOORU_URL;
const DANBOORU_LOGIN = process.env.DANBOORU_LOGIN;
const DANBOORU_KEY = process.env.DANBOORU_KEY;

const sagiriClient = sagiri(SAUCENAO_API_KEY, {
    results: 5,
});

const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
    'Content-Type': 'application/json',
});

async function gqlAuth() {
    const auth = gql`
        mutation {
            login(username: "${SHIMMIE_LOGIN}", password: "${SHIMMIE_PASSWORD}") {
                user {
                    name
                }
                session
            }
        }
    `;

    return await graphqlClient.request(auth);
}

async function fetchImageWithTag(tag) {
    const query = gql`
        query {
            posts(limit: 1, offset: 0, tags: "${tag}") {
                id
                post_id
                hash
                ext
                image_link
            }
        }
    `;

    const data = await graphqlClient.request(query);
    return data.posts[0];
}

async function downloadImage(url, path) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(path, Buffer.from(arrayBuffer));
}

async function uploadToChibisafe(filePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const response = await fetch(CHIBISAFE_UPLOAD_URL, {
        method: 'POST',
        body: form,
        headers: {
            ...form.getHeaders(),
            'x-api-key': CHIBISAFE_API_KEY,
        }
    });

    const data = await response.json();
    return data.url;
}

async function reverseSearchImage(url) {
    return await sagiriClient(url);
}

async function fetchDanbooruMetadata(url) {
    const booruId = url.split('/').pop();
    const apiUrl = `${DANBOORU_URL}/${booruId}.json?login=${DANBOORU_LOGIN}&api_key=${DANBOORU_KEY}`;
    const response = await fetch(apiUrl);
    return response.json();
}

async function updateWithDanbooru(post_id, metadata) {
    const charTags = metadata.tag_string_character.split(' ').filter(Boolean).map(tag => `character:${tag}`);
    const artistTags = metadata.tag_string_artist.split(' ').filter(Boolean).map(tag => `artist:${tag}`);
    const metaTags = metadata.tag_string_meta.split(' ').filter(Boolean).map(tag => `meta:${tag}`);
    const seriesTags = metadata.tag_string_copyright.split(' ').filter(Boolean).map(tag => `series:${tag}`);
    const generalTags = metadata.tag_string_general.split(' ').filter(Boolean);
    const tags = [...charTags, ...artistTags, ...metaTags, ...seriesTags, ...generalTags, 'meta:danbooru'].join(' ');
    const source = metadata.source;
    const rating = metadata.rating;

    return await updateImageMetadata(post_id, tags, source, rating);
}

async function updateImageMetadata(post_id, tags, source, rating) {
    const mutation = gql`
        mutation {
            update_post_metadata(
                post_id: ${post_id}, 
                metadata: [
                    {key: "tags", value: "${tags} meta:metamaster"},
                    {key: "source", value: "${source}"},
                    {key: "rating", value: "${rating}"}
                ]
            ) {
                id
                tags
                source
            }
        }
    `;

    return await graphqlClient.request(mutation);
}

async function setNotFoundMetadata(post_id, chibisafeUrl) {
    const mutation = gql`
        mutation {
            update_post_metadata(
                post_id: ${post_id}, 
                metadata: [
                    {key: "tags", value: "meta:unknown"},
                    {key: "source", value: "${chibisafeUrl}"},
                ]
            ) {
                id
                tags
                source
            }
        }
    `;

    return await graphqlClient.request(mutation);
}

function getSiteName(reverseSearchResult)
{
    return reverseSearchResult.site.replace('.', '_').toLowerCase();
}

(async () => {
    try {
        const authResult = await gqlAuth();
        console.log('Logged in as:', authResult.login.user.name);

        const cookies = `shm_user=${authResult.login.user.name}; shm_session=${authResult.login.session}`;
        graphqlClient.setHeader('Cookie', cookies)
        
        let subsequentErrors = 0;
        while (true) {
            try {
                console.log('-'.repeat(20));
                const image = await fetchImageWithTag('tagme');
                console.log('Image fetched:', image.id);

                if (!image) {
                    console.log('No more images to process.');
                    break;
                }

                const tempImagePath = `/tmp/${image.hash}.${image.ext}`;
                const url = `${SHIMMIE_ENDPOINT}${image.image_link}`;

                await downloadImage(url, tempImagePath);
                console.log('Image downloaded successfully:', tempImagePath);

                const chibisafeUrl = await uploadToChibisafe(tempImagePath);
                console.log('Image uploaded to Chibisafe:', chibisafeUrl);

                const reverseSearchResults = await reverseSearchImage(chibisafeUrl);
                const danbooruResult = reverseSearchResults.find(result => result.index === 9 && result.similarity > 80);
                if (danbooruResult) {
                    console.log('Reverse search result:', danbooruResult.url);

                    const metadata = await fetchDanbooruMetadata(danbooruResult.url);
                    console.log('Danbooru post id:', metadata.id);

                    const mutationResult = await updateWithDanbooru(image.post_id, metadata);
                    const newMeta = mutationResult.update_post_metadata;
                    console.log(`Image metadata updated successfully. 
                        Tags: ${newMeta.tags.length}, 
                        Source: ${newMeta.source}`);
                } else {
                    console.log('No Danbooru match found. Attepmting to set basic metadata...');
                    
                    let site = '';
                    const resultWithAuthor = reverseSearchResults.find(result => result.similarity > 80 && result.authorName != null);
                    if (resultWithAuthor)
                    {
                        site = getSiteName(resultWithAuthor);
                        updateImageMetadata(image.post_id, `artist:${resultWithAuthor.authorName} meta:${site}`, resultWithAuthor.url, '?');
                        console.log('Image metadata updated with external link and author.');
                    }
                    else {
                        const simpleResult = reverseSearchResults.find(result => result.similarity > 80);
                        if (simpleResult)
                        {
                            site = getSiteName(simpleResult);
                            updateImageMetadata(image.post_id, `meta:${site}`, simpleResult.url, '?');
                            console.log('Image metadata updated with external link.');
                        }
                        else {
                            await setNotFoundMetadata(image.post_id, chibisafeUrl);
                            console.log('Image metadata updated with not found status.');
                        }
                    }
                }

                subsequentErrors = 0;
                
                console.log(`Post link: ${SHIMMIE_ENDPOINT}/post/view/${image.post_id}`);
                console.log('Cooling down...');
            } catch (error) {
                console.error('Error:', error);

                subsequentErrors++;
                if (subsequentErrors > 3) {
                    console.error('Too many subsequent errors. Please check the logs above for more information. Exiting...');
                    break;
                }

                console.log(`Retrying in 9 seconds (${subsequentErrors}/3)...`);
            }

            await new Promise(resolve => setTimeout(resolve, 9000));
        }
    } catch (error) {
        console.error('Error:', error);
    }
})();
