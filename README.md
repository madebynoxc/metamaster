**Automatically tag posts in your self-hosted Shimmie2**

Using pre-defined processors, MetaMaster extracts tags, source and rating from posts using SauceNAO as a reverse image search tool. It bundles up a bunch of API calls into a streamlined workflow: `get post -> (upload to public cloud) -> reverse search -> find a fitting processor -> update post metadata`. See below for `.env` configuration to specify API keys.

Make sure that `GraphQL` extension is enabled in Shimmie.

## Usage

If you don't have `pnpm` installed (`pnpm --version`) you can install it [here](https://pnpm.io/installation).

After pulling this repository:

```sh
pnpm i && pnpm build
```

Make your own `.env` file from the template (see Environment section for details):

```sh
cp .env.template .env
vim .env
```

Run with your args (see Arguments section for details):

```sh
pnpm start --append --compress
```

Schedule in Cron. I run two commands, one for general purpose tagging with posts uploaded with `tagme` every 3 hours:

```sh
20 */3 * * * cd /home/noxc/metamaster && /home/noxc/.local/share/pnpm/pnpm start --append --upload --compress --markUnknown >> ./general-run.log 2>&1 
```

Other is for tagging posts uploaded using https://github.com/madebynoxc/bsky2booru

```sh
10 */12 * * * cd /home/noxc/metamaster && /home/noxc/.local/share/pnpm/pnpm start --append --upload --compress --tag="bluesky" --add="meta:bluesky" >> ./bsky-run.log 2>&1
```

## Envirnonment

- `SAUCENAO_API_KEY` - API key for SauceNAO. Has restrictions, see https://saucenao.com/user.php?page=search-api
- `SHIMMIE_ENDPOINT` - Address to your Shimmie2.
- `SHIMMIE_LOGIN` - Login to Shimmie2. User HAS TO have permissions to edit posts. 
- `SHIMMIE_PASSWORD` - Password to Shimmie user. 
- `CHIBISAFE_UPLOAD_URL` - (optional) Useful if you host your Shimmie closed from the internet and use other that can be accessed by services like SauceNAO. I use Chibisafe, but you can use anything that supports HTTP file upload with POST and uses `x-api-key`. Modify `uploadToChibisafe` method if needed. Requires `--upload` argument.
- `CHIBISAFE_API_KEY` - (optional) The `x-api-key` of your image host.
- `DANBOORU_LOGIN` - (optional) Danbooru login to avoid rate limits.
- `DANBOORU_KEY` - (optional) Danbooru key to avoid rate limits.
- `GELBOORU_ID` - (optional) Gelbooru login to avoid rate limits.
- `GELBOORU_KEY` - (optional) Gelbooru key to avoid rate limits.

## Arguments

- `--append` - If set, appends new tags to the old ones. Shimmie will make sure to remove duplicates.
- `--tag` - Custom tag to search, default is `tagme`. That tag will be removed from the post, otherwise the program will keep picking the same post.
- `--add` - Tags to add. Needs a string, tags separated by space, e.g. `--add meta:video twitter usingMetaMaster`.
- `--upload` - If set, uploads the image to a public cloud. `CHIBISAFE_UPLOAD_URL` and `CHIBISAFE_API_KEY` are required. If your Shimmie serves URLs accessable from the internet, this can be avoided.
- `--compress` - If set, compresses the imae to `webp` before uploading to the public cloud. This reduces the size of the image significantly, but might impact the search purity. Only works when `--upload` is set.
- `--overrideSource` - If set, the post source will be overriden. Otherwise, source will be set only if the target post has surce set to null.
- `--markUnknown` - If set, adds `meta:unknown` to the posts that didn't pass the search similarity, thus not found through SauceNAO. It is useful to have it so the failed posts can be set manually.
- `--extract` - If set, the scan will not be run, instead if will use processors to parse specified booru URL and print tags, source and rating so it can be copied and pasted easily to Shimmie.

## Processors

By default MetaMaster supports Danbooru Gelbooru, Konachan and Yande.re. If no processor matched the reverse image search, it will try to extract author and source from SauceNAO result (works for Pixiv, for example).

You can add your own processor if you wish to add more data from a specific site, that is [indexed by SauceNAO](https://saucenao.com/tools/examples/api/index_details.txt). Create a new processor file and make sure to return the following object:

```js
export default {
    name: string,   // The name used in logs and for tags
    index: integer, // Index from SauceNAO index
    url: URL,       // URL object of the processor. Used only for --extract
    fetchMetadata:  // Method that returns an object or null
        {
            tags,
            source,
            rating,
        } 
};
```

Apologies for scuffed ways of adding processor, I didn't care to rewrite to TS when I was adding features.
