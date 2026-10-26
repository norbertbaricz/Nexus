# Live GIF search

Nexus 2.5 integrates the GIPHY web API for keyword search and trending GIFs.

## Configure the hosting instance

1. Create an app and web API key in the [GIPHY developer dashboard](https://developers.giphy.com/).
2. Restrict the key to the real Nexus deployment domains and obtain the appropriate production access before launching publicly.
3. Add `GIPHY_API_KEY=your_web_api_key` to the existing private `.env` file. Do not replace your other deployment settings.
4. Restart Nexus and refresh the browser. Sign in, open a conversation and select GIF.
5. Verify trending, a keyword search, Load more, selection, the composer preview, sending and reopening the conversation.

The key is intentionally supplied to signed-in browsers. It is a browser web API key, not a server-only credential; domain restrictions and provider quotas are necessary. Never put unrelated private credentials in this setting.

GIPHY requires Search and Trending requests to originate on the client. Nexus therefore sends these requests directly to `https://api.giphy.com`, without Nexus session cookies. The Content Security Policy explicitly permits that API origin. Images load from provider media URLs, retaining their parameters. Search terms and normal request/network information are visible to the provider; message bodies, profile data and Nexus session cookies are not included in the GIF API request.

## Behavior

The first page contains trending results; entering text switches to exact keyword search. Queries are limited to 50 characters. Requests use `rating=pg`, 24 results and explicit offsets. Input waits 350 ms before a request; superseded requests are aborted. Empty results, network failure, rate limiting and missing configuration have visible states. The picker includes Powered by GIPHY attribution. In 2.9, fixed-height cells prevent thumbnail collapse as more pages are appended. Duplicate provider IDs are ignored, a changed query resets pagination, and a non-advancing page cannot loop indefinitely.

Selecting a GIF does not send a message immediately. A preview appears in the composer. Sending persists its provider ID, title and HTTPS media URL. The backend independently validates the provider, CDN hostname, identifier, media path, GIF format and attachment count. Channel attachment permissions apply to provider GIFs as well as uploaded files. Arbitrary hosts, credentials in URLs, non-HTTPS URLs and executable formats are rejected.

External media remains hosted by GIPHY and may disappear if the provider removes it. Nexus does not rehost the provider's media. Existing original local GIF attachments continue to work.

## Verification boundary

Automated checks cover query encoding, pagination, preview/reference mapping, empty/rate-limit/cancel states, authenticated configuration, URL validation, persistence and channel attachment restrictions. The missing-key UI was checked in the browser. No live production key was provided, so provider availability, account approval and real quota remain to be verified by the hosting operator.

Primary integration documentation: [GIPHY API](https://developers.giphy.com/docs/api/) and [integration requirements](https://developers.giphy.com/docs/).
