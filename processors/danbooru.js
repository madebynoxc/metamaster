import { fetchJson } from '../http.js';

const DANBOORU_URL = 'https://danbooru.donmai.us/posts';
const NAME = 'danbooru';
const INDEX = 9;

const ratings = {
    s: 'q',
    q: 'q',
    e: 'e',
    g: 's',
};

function extractMetadata(metadata) {
    const charTags = metadata.tag_string_character.split(' ').filter(Boolean).map(tag => `character:${tag}`);
    const artistTags = metadata.tag_string_artist.split(' ').filter(Boolean).map(tag => `artist:${tag}`);
    const metaTags = metadata.tag_string_meta.split(' ').filter(Boolean).map(tag => `meta:${tag}`);
    const seriesTags = metadata.tag_string_copyright.split(' ').filter(Boolean).map(tag => `series:${tag}`);
    const generalTags = metadata.tag_string_general.split(' ').filter(Boolean);
    const tags = [...charTags, ...artistTags, ...metaTags, ...seriesTags, ...generalTags, `meta:${NAME}`];
    const source = metadata.source || `https://danbooru.donmai.us/posts/${metadata.id}`;
    const rating = ratings[metadata.rating] || '?';

    return {
        tags,
        source,
        rating,
    };
}

async function fetchMetadata(url) {
    try {
        const booruId = url.split('/').pop();
        const login = process.env.DANBOORU_LOGIN;
        const key = process.env.DANBOORU_KEY;

        let apiUrl = `${DANBOORU_URL}/${booruId}.json`;

        if (login && key) {
            apiUrl = `${DANBOORU_URL}/${booruId}.json?login=${login}&api_key=${key}`;
        }
        
        const metadata = await fetchJson(apiUrl);
        return extractMetadata(metadata);
    }
    catch (error) {
        console.error('[DANBOORU] Error fetching metadata:', error.message);
        return null;
    }
};

async function searchBySource(sourceUrl) {
    try {
        const login = process.env.DANBOORU_LOGIN;
        const key = process.env.DANBOORU_KEY;

        let apiUrl = `https://danbooru.donmai.us/posts.json?tags=source:${encodeURIComponent(sourceUrl)}`;

        if (login && key) {
            apiUrl += `&login=${login}&api_key=${key}`;
        }
        
        const results = await fetchJson(apiUrl);

        if (Array.isArray(results) && results.length > 0) {
            return extractMetadata(results[0]);
        }
        return null;
    }
    catch (error) {
        console.error('[DANBOORU] Error searching by source:', error.message);
        return null;
    }
}

export default {
    name: NAME,
    index: INDEX,
    url: new URL(DANBOORU_URL),
    fetchMetadata,
    searchBySource,
};
