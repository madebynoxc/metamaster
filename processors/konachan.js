const KONACHAN_URL = 'https://konachan.com/post.json';
const NAME = 'konachan';
const INDEX = 26;

async function fetchMetadata(url) {
    try {
        const konachanId = url.split('/').pop();
        const apiUrl = `${KONACHAN_URL}?tags=id:${konachanId}`;
        const res = await fetch(apiUrl);
        const metadata = (await res.json())[0];

        const postTags = metadata.tags.split(' ').filter(Boolean);
        const tags = [...postTags, `meta:${NAME}`];
        const source = metadata.source || `https://konachan.com/post/show/${konachanId}`;
        const rating = metadata.rating || '?';

        return {
            tags,
            source,
            rating,
        };
    }
    catch (error) {
        console.error('[KONACHAN] Error fetching metadata:', error);
        return null;
    }
};

export default {
    name: NAME,
    index: INDEX,
    url: new URL(KONACHAN_URL),
    fetchMetadata,
};