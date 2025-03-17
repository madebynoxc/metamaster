const DANBOORU_URL = 'https://danbooru.donmai.us/posts';
const NAME = 'danbooru';
const INDEX = 9;

async function fetchMetadata(url) {
    try {
        const booruId = url.split('/').pop();
        const login = process.env.DANBOORU_LOGIN;
        const key = process.env.DANBOORU_KEY;

        let apiUrl = `${DANBOORU_URL}/${booruId}.json`;

        if (login && key) {
            apiUrl = `${DANBOORU_URL}/${booruId}.json?login=${login}&api_key=${key}`;
        }
        
        const res = await fetch(apiUrl);
        const metadata = await res.json();

        const charTags = metadata.tag_string_character.split(' ').filter(Boolean).map(tag => `character:${tag}`);
        const artistTags = metadata.tag_string_artist.split(' ').filter(Boolean).map(tag => `artist:${tag}`);
        const metaTags = metadata.tag_string_meta.split(' ').filter(Boolean).map(tag => `meta:${tag}`);
        const seriesTags = metadata.tag_string_copyright.split(' ').filter(Boolean).map(tag => `series:${tag}`);
        const generalTags = metadata.tag_string_general.split(' ').filter(Boolean);
        const tags = [...charTags, ...artistTags, ...metaTags, ...seriesTags, ...generalTags, `meta:${NAME}`];
        const source = metadata.source || `https://danbooru.donmai.us/posts/${booruId}`;
        const rating = metadata.rating || '?';

        return {
            tags,
            source,
            rating,
        };
    }
    catch (error) {
        console.error('[DANBOORU] Error fetching metadata:', error);
        return null;
    }
};

export default {
    name: NAME,
    index: INDEX,
    fetchMetadata,
};
