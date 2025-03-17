const GELBOORU_URL = 'https://gelbooru.com/index.php';
const NAME = 'gelbooru';
const INDEX = 25;

function getValidHttpUrl(string) {
    let url;
    
    try {
      url = new URL(string);
    } catch (_) {
      return false;  
    }
  
    if (url.protocol === "http:" || url.protocol === "https:")
    {
        return url.href;
    }

    return false; 
}

const ratings = {
    sensitive: 'q',
    questionable: 'q',
    explicit: 'e',
    general: 's',
};

async function fetchMetadata(url) {
    try {
        const gelbooruId = new URL(url).searchParams.get('id');
        let apiUrl = `${GELBOORU_URL}?page=dapi&s=post&q=index&json=1&id=${gelbooruId}`;
        const userId = process.env.GELBOORU_ID;
        const apiKey = process.env.GELBOORU_KEY;
        
        if (userId && apiKey) {
            apiUrl += `&user_id=${userId}&api_key=${apiKey}`;
        }

        const res = await fetch(apiUrl);
        const data = await res.json();
        const metadata = data.post[0];
        const postTags = metadata.tags.split(' ').filter(Boolean);
        console.log(metadata);

        const tags = [...postTags, `meta:${NAME}`];
        const source = getValidHttpUrl(metadata.source) || `https://gelbooru.com/index.php?page=post&s=view&id=${gelbooruId}`;
        const rating = ratings[metadata.rating] || '?';

        return {
            tags,
            source,
            rating,
        };
    }
    catch (error) {
        console.error('[GELBOORU] Error fetching metadata:', error);
        return null;
    }
};

export default {
    name: NAME,
    index: INDEX,
    fetchMetadata,
};
