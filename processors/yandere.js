const YANDERE_URL = 'https://yande.re/post.json';
const NAME = 'yandere';
const INDEX = 12;

async function fetchMetadata(url) {
    try {
        const yandereId = url.split('/').pop();
        const apiUrl = `${YANDERE_URL}?tags=id:${yandereId}`;
        const res = await fetch(apiUrl);
        const metadata = (await res.json())[0];

        const postTags = metadata.tags.split(' ').filter(Boolean);
        const tags = [...postTags, `meta:${NAME}`];
        const source = metadata.source || `https://yande.re/post/show/${yandereId}`;
        const rating = metadata.rating || '?';

        return {
            tags,
            source,
            rating,
        };
    }
    catch (error) {
        console.error('[YANDERE] Error fetching metadata:', error);
        return null;
    }
};

export default {
    name: NAME,
    index: INDEX,
    fetchMetadata,
};