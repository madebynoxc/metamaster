import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import sagiri from 'sagiri';
import dotenv from 'dotenv';
import sharp from 'sharp';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { gql, GraphQLClient } from 'graphql-request';

dotenv.config();
const SAUCENAO_API_KEY = process.env.SAUCENAO_API_KEY;

const SHIMMIE_ENDPOINT = process.env.SHIMMIE_ENDPOINT;
const GRAPHQL_ENDPOINT = `${SHIMMIE_ENDPOINT}/graphql`;
const SHIMMIE_LOGIN = process.env.SHIMMIE_LOGIN;
const SHIMMIE_PASSWORD = process.env.SHIMMIE_PASSWORD;

const CHIBISAFE_UPLOAD_URL = process.env.CHIBISAFE_UPLOAD_URL;
const CHIBISAFE_API_KEY = process.env.CHIBISAFE_API_KEY;

const DEFAULT_TAG = 'tagme';
const MAX_SIMILARITY = 80;
const MIN_SIMILARITY = 40;

const argv = yargs(hideBin(process.argv)).argv

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
                tags
                source
                hash
                ext
                image_link
            }
        }
    `;

    const data = await graphqlClient.request(query);
    return data.posts[0];
}

async function downloadImage(url, path, compress) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    let buffer;

    if (compress) {
        buffer = await sharp(arrayBuffer)
            .removeAlpha()
            .toFormat('webp', { quality: 80 })
            .toBuffer();
    }
    else {
        buffer = Buffer.from(arrayBuffer);
    }
    
    fs.writeFileSync(path, buffer);
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

async function updateImageMetadata(image, tags, source, rating, overrideSource, searchTag) {
    const post_id = image.post_id;
    const metadata = [{
        key: 'tags',
        value: `${[...tags, ...image.tags].filter(t => t != searchTag).join(' ')} meta:metamaster`
    }];

    if (!image.source || overrideSource)
    {
        metadata.push({
            key: 'source',
            value: source
        });
    }

    if (rating && rating !== '?') {
        metadata.push({
            key: 'rating',
            value: rating
        });
    }

    const mutation = gql`
        mutation {
            update_post_metadata(
                post_id: ${post_id}, 
                metadata: ${JSON.stringify(metadata).replace(/"([^"]+)":/g, '$1:')}
            ) {
                id
                tags
                source
            }
        }
    `;

    return await graphqlClient.request(mutation);
}

async function setNotFoundMetadata(image, publicUrl, searchTag, markUnknown) {
    const post_id = image.post_id;
    const source = image.source || publicUrl;
    const tags = image.tags.filter(t => t != searchTag);
    const mutation = gql`
        mutation {
            update_post_metadata(
                post_id: ${post_id}, 
                metadata: [
                    {key: "tags", value: "${tags.join(' ')} ${markUnknown? 'meta:unknown' : ''} meta:metamaster"},
                    {key: "source", value: "${source}"},
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
    return reverseSearchResult.site.replace('.', '_').replace(/ /g, '_').toLowerCase();
}

(async () => {
    try {
        const extract = argv.extract || false;
        if (extract) {
            const extractUrl = new URL(extract);
            const processors = (await import("./processors/index.js")).default;

            for (const processor of processors.filter(p => extractUrl.origin == p.url.origin)) {
                const metadata = await processor.fetchMetadata(extract);
                console.log(`[Tags]`, metadata.tags.join(' '));
                console.log(`[Source]`, metadata.source);
                console.log(`[Rating]`, metadata.rating);
                break;
            }

            return;
        }

        const searchTag = argv.tag || DEFAULT_TAG;
        const addTags = argv.add?.split(' ') || [];
        const append = argv.append || false;
        const upload = argv.upload || false;
        const compress = argv.compress || false;
        const overrideSource = argv.overrideSource || false;
        const markUnknown = argv.markUnknown || false;

        console.log(`Searching for tag: '${searchTag}'`, );
        console.log(`Additional tags:`, addTags);

        const check = await fetchImageWithTag(searchTag);

        if (!check) {
            console.log(`No images found with the tag: '${searchTag}'`);
            return;
        }

        const authResult = await gqlAuth();
        console.log('Logged in as:', authResult.login.user.name);

        const cookies = `shm_user=${authResult.login.user.name}; shm_session=${authResult.login.session}`;
        graphqlClient.setHeader('Cookie', cookies)

        const processors = (await import("./processors/index.js")).default;
        processors.sort((a, b) => a.index - b.index);

        const sagiriClient = sagiri(SAUCENAO_API_KEY, {
            results: 5,
        });
        
        let subsequentErrors = 0;
        while (true) {
            try {
                console.log('-'.repeat(20));
                const image = await fetchImageWithTag(searchTag);

                if (!image) {
                    console.log('No more images to process with tag', searchTag);
                    break;
                }
                
                console.log('Image fetched:', image.id);
                const ext = compress? 'webp' : image.ext;
                const tempImagePath = `/tmp/${image.hash}.${ext}`;
                const url = `${SHIMMIE_ENDPOINT}${image.image_link}`;
                image.tags = append? [...image.tags, ...addTags] : addTags;
                
                let publicUrl = url;
                if (upload) {
                    await downloadImage(url, tempImagePath, compress);
                    console.log('✅Image downloaded successfully:', tempImagePath);

                    const chibisafeUrl = await uploadToChibisafe(tempImagePath);
                    console.log('✅Image uploaded to Chibisafe:', chibisafeUrl);
                    publicUrl = chibisafeUrl;
                }
                
                const reverseSearchResults = await sagiriClient(publicUrl);
                const fittingResults = reverseSearchResults
                    .filter(result => result.similarity > MAX_SIMILARITY && processors.some(p => p.index === result.index))
                    .sort((a, b) => a.index - b.index);
                
                let processorSuccess = false;
                console.log(fittingResults.length, 'fitting results found.');
                fittingResults.map(result => result.url).forEach(url => console.log(`---| ${url}`));

                for (const result of fittingResults) {
                    const processor = processors.find(p => p.index === result.index);
                    const logTitle = processor.name.toUpperCase();

                    console.log(`⏳[${logTitle}] Processing image...`);

                    try {
                        const metadata = await processor.fetchMetadata(result.url);

                        if (metadata) {
                            console.log(`✅[${logTitle}] Image metadata fetched successfully.`);
                            const mutationResult = await updateImageMetadata(image, metadata.tags, metadata.source, metadata.rating, overrideSource, searchTag);
                            const newMeta = mutationResult.update_post_metadata;
                            console.log(`✅[${logTitle}] Image metadata updated successfully.
                                Tags: ${newMeta.tags.length},
                                Source: ${newMeta.source}
                                Rating: ${metadata.rating}`);

                            processorSuccess = true;
                            break;
                        }
                    } catch (error) {
                        console.error(`❌[${logTitle}] Error:`, error);
                    }
                }

                if (!processorSuccess) {
                    console.log('⏳No processor match found. Attepmting to set basic metadata...');
                    
                    let site = '';
                    const resultWithAuthor = reverseSearchResults.find(result => result.similarity > MAX_SIMILARITY && result.authorName != null);
                    if (resultWithAuthor)
                    {
                        site = getSiteName(resultWithAuthor);
                        const authorName = resultWithAuthor.authorName.replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>/{\}\\[\]\/]/gi, '').replace(/ /g, '_');
                        await updateImageMetadata(image, [`artist:${authorName}`, `meta:${site}`], resultWithAuthor.url, '?', overrideSource, searchTag);
                        console.log(`✅[EXT + AUTHOR] Image metadata updated with external link (${site}) and author (${authorName}).`);
                    }
                    else {
                        const simpleResult = reverseSearchResults.find(result => result.similarity > MAX_SIMILARITY);
                        if (simpleResult)
                        {
                            site = getSiteName(simpleResult);
                            await updateImageMetadata(image, [`meta:${site}`], simpleResult.url, '?', overrideSource, searchTag);
                            console.log(`✅[EXT] Image metadata updated with external link (${site}).`);
                        }
                        else {
                            await setNotFoundMetadata(image, publicUrl, searchTag, markUnknown);
                            console.log('❌[NOT FOUND] Image metadata updated with not found status.');
                            
                            const lowSimilarity = reverseSearchResults.find(result => result.similarity > MIN_SIMILARITY);
                            if (lowSimilarity)
                            {
                                console.log('Low similarity result:', lowSimilarity.url);
                            }
                        }
                    }
                }

                subsequentErrors = 0;
                
                console.log(`Post link: ${SHIMMIE_ENDPOINT}/post/view/${image.post_id}`);
                console.log('Cooling down...');
            } catch (error) {
                console.error('❌Error:', error);

                subsequentErrors++;
                if (subsequentErrors >= 3) {
                    console.error('❌Too many subsequent errors. Please check the logs above for more information. Exiting...');
                    break;
                }

                console.log(`Retrying in 9 seconds (${subsequentErrors}/3)...`);
            }

            await new Promise(resolve => setTimeout(resolve, 9000));
        }
    } catch (error) {
        console.error('❌Error:', error);
    }
})();
