eBay Integration Source of Truth
1. Purpose & Non-Negotiable Rules

Official Usage and Restrictions: eBay provides APIs to interact with its marketplace and strictly forbids any practices that undermine its platform. Developers must use the official eBay APIs for data access and actions – bypassing them (e.g. scraping eBay’s website) or using eBay data in unauthorized ways is prohibited. The eBay API License Agreement explicitly disallows using eBay content to compete with eBay or build services that undermine eBay’s business. For example, an application may NOT use eBay data to model or suggest prices for eBay listings without permission, and may not aggregate eBay sales performance data to compare with other platforms. Automated scraping of eBay’s site (instead of using APIs) is not allowed; it is considered a violation of the terms as it circumvents eBay’s controls and could infringe on third-party rights.

Token and Key Handling: When you join the eBay Developers Program, you receive an application keyset (App ID, Dev ID, Cert ID). The Client ID (App ID) is your public application identifier, while the Client Secret (Cert ID) is confidential. Never expose the client secret in client-side code or distribute it – treat it like a password. All OAuth tokens and keys must be kept secure. eBay’s guidelines state that access tokens, refresh tokens, and client secrets are sensitive credentials and must be stored securely (e.g. on a server, not in public code or local storage). If a refresh token or secret is ever compromised, you should immediately revoke it and re-authorize, as misuse could allow malicious actions.

Data Honesty – Active vs. Sold Listings: eBay expects developers to present data accurately and comply with pricing regulations. If your integration shows pricing information (e.g. item values or “comps”), you must not mislead users. Active listing prices are not actual sale prices until a transaction occurs. Using active listings as “sold comparables” without clarification is considered deceptive. In fact, eBay requires compliance with FTC guidelines on deceptive pricing. This means if you display an item’s “market price” or savings, it should be based on legitimate sold data or clearly identified as an asking price. Do not falsely represent active listing prices as items’ value. Notably, sold listing data is tightly controlled (see Section 6); if sold prices are unavailable via API, any “value estimates” must state they are derived from current listings or other sources, not actual sales. Providing stale or dishonest data can violate eBay policy and consumer protection laws.

OAuth Requirement: All modern eBay API integrations must use OAuth 2.0 for authorization. There is no alternative for accessing user-specific data – you cannot ask for eBay passwords or use older Auth’n’Auth tokens (except for legacy SOAP APIs) without eBay’s approval. Each API call requires a valid OAuth access token in the HTTP Authorization header. eBay’s APIs will reject unauthorized calls with HTTP 401/403 errors. Moreover, eBay mandates a proper authorization code flow for user consent (see Section 4). In practice, this means your app must redirect users to eBay’s login/consent page and handle the OAuth token exchange; any attempt to circumvent the official OAuth web flow (such as embedding eBay login credentials in your app) is forbidden. In summary, follow eBay’s OAuth process to the letter – it’s non-negotiable for gaining access to eBay data on behalf of users.

2. Environment Model

eBay operates two environments for development: Sandbox (test environment) and Production (live eBay marketplace). These environments are completely separate, and credentials, APIs, and data do not cross over.

Separate Credentials: When you register your application, eBay provides two sets of API keys – one for Sandbox and one for Production. Each environment has its own Client ID and Client Secret. Always use the appropriate key for the target environment; a production key will not work in sandbox and vice versa. For example, the OAuth client_id for production is different from the sandbox one, even for the same application. If you use the wrong combination (e.g. production client_id on sandbox), the authorization will fail with errors like “unauthorized_client” (the eBay auth server won’t recognize the client) because the app is not registered in that environment.

Different Endpoints and Hosts: All API endpoints have distinct URIs for sandbox vs production. Base URLs for API calls in Production use api.ebay.com, while Sandbox calls use api.sandbox.ebay.com. For example:

Production REST API base: https://api.ebay.com/... (e.g. https://api.ebay.com/buy/browse/v1/item_summary/search).

Sandbox REST API base: https://api.sandbox.ebay.com/... .
Similarly, OAuth authorization endpoints differ:

Production OAuth authorize: https://auth.ebay.com/oauth2/authorize

Sandbox OAuth authorize: https://auth.sandbox.ebay.com/oauth2/authorize
And token endpoints:

Production token: https://api.ebay.com/identity/v1/oauth2/token

Sandbox token: https://api.sandbox.ebay.com/identity/v1/oauth2/token .
Ensure your code uses the correct hostnames depending on environment. Do not mix sandbox tokens or URLs with production – a token issued by api.sandbox.ebay.com will be invalid on api.ebay.com (and vice versa).

Sandbox Use and Limitations: The eBay Sandbox is for testing and simulating eBay workflows without affecting real accounts or listings. You must create sandbox test users (separate from real eBay accounts) to simulate buyer/seller interactions. Production user accounts do not work on sandbox (login will fail) and sandbox test accounts don’t exist on production. Similarly, listings created in sandbox (via API or sandbox web UI) are not visible on the real eBay site; they reside only in the sandbox environment. Use the sandbox for development and QA, then switch to production keys and endpoints for real usage.

Environment Isolation: Keep configuration for sandbox and production isolated. This includes OAuth redirect URLs (RuNames) – you get a distinct RuName for sandbox and another for production. When obtaining OAuth tokens in sandbox, direct users to the sandbox auth site and use the sandbox RuName; for production, use the production auth site and RuName. If these are mixed up, the eBay Developer portal will reject the request. For instance, if you attempt to authorize using auth.ebay.com with a sandbox RuName or key, you’ll get an error that the client is not found/authorized.

Data and Feature Differences: The sandbox mirrors many eBay APIs but not all production features are fully available. Call limits are usually relaxed in sandbox. However, some APIs (especially buying flows or payments) have limited sandbox functionality. Always confirm whether a particular API supports sandbox testing. eBay’s documentation notes which APIs or methods are supported in sandbox. If something works in production but not in sandbox, check the docs or sandbox status page for limitations.

In summary: Use sandbox for all testing with its own keys, users, and endpoints, and switch to production keys and URLs when going live. Never use production credentials or tokens in sandbox calls (or vice versa). Mixing environments will result in authentication errors (HTTP 401/403 or OAuth client errors). Keeping this model straight is essential – treat sandbox and production as two separate eBay worlds.

3. Key Concepts (No Confusion Allowed)

Client ID vs Client Secret: In your eBay application keyset, the Client ID (also called App ID) is the public identifier for your application, and the Client Secret (Cert ID) is the private key used for authentication. The Client ID is included in OAuth URLs and identifies your app to eBay. The Client Secret must remain confidential – it’s used to sign token requests via HTTP Basic auth. For example, when exchanging an auth code for a token, you include an Authorization header with Basic {Base64Encode(ClientID:ClientSecret)}. The client secret should only be used on secure servers, not in front-end or mobile code. In practice, this means your mobile or JavaScript app should not directly hold the secret; perform token exchanges on a backend service. Treat the secret and refresh tokens as you would passwords (store encrypted, limit access). The Client ID, in contrast, can be embedded in the OAuth authorize URL safely. Both the Client ID and secret are unique per environment as noted (sandbox vs prod).

RuName (Redirect URL Name): eBay uses a concept called RuName for OAuth redirects. A RuName is a registered Redirect URI Name associated with your application, configured in the Developer Portal. It encapsulates your app’s callback URLs for OAuth. When you create or edit your application settings, you specify an Auth Accepted URL and Auth Declined URL (and a privacy policy URL) which get bound into a RuName string. eBay then issues you a RuName value (an identifier string). In OAuth flows, instead of providing an arbitrary redirect URL, you must use this RuName value as the redirect_uri parameter. eBay’s auth server knows the actual URLs behind that RuName and will redirect the user accordingly after login. In short, RuName is a proxy for your redirect URLs, ensuring only pre-validated URLs are used in OAuth.

Why it exists: This adds security and consistency. eBay only allows redirects to URLs that you’ve configured (preventing malicious redirects). It also simplifies the OAuth URL (since the RuName is shorter than a full URL and identifies your app). Historically, RuName was part of eBay’s legacy Auth’n’Auth system, and it continues in OAuth 2.0 as a required element.

Usage: You must obtain a RuName for both Sandbox and Production environments. In the portal, you will configure for each RuName: a Display Title (shown on the eBay consent page), a Privacy Policy URL, an Auth Accepted URL, and an Auth Declined URL. The Auth Accepted URL is where eBay will redirect users if they grant access, and the Auth Declined URL is where users go if they refuse/deny consent. These are typically endpoints on your site or app that handle post-login success or cancellation. For example, Auth Accepted could be a page or API endpoint that captures the authorization code and shows a “Success, you can close this window” message, whereas Auth Declined might show “You declined to connect your eBay account.”

Requirements: If you plan to use OAuth (user tokens), configuring the RuName’s URLs is mandatory. Without valid accepted/declined URLs and a privacy policy, eBay will not allow the OAuth flow for your app. The RuName value itself is used as redirect_uri when building the consent URL (format: redirect_uri={RuName}). Note that the exact RuName must match what’s registered; even small mismatches (like using a production RuName on sandbox or a typo) will cause an OAuth error.

Accepted vs Declined flow: When a user clicks “I Agree” on eBay’s consent page, eBay redirects to your Accept URL (via the RuName) with the authorization code. If the user clicks “Not now” (i.e., declines), eBay redirects to your Decline URL. It’s up to your application to handle each case appropriately (exchange the code for a token on accept; handle the lack of code on decline, perhaps by informing the user that connection was not made). Always test that both URLs are working. (Tip: In sandbox, you can simulate both outcomes easily.)

Auth Accepted vs Auth Declined URL: These are simply the two endpoints you provide to eBay for post-auth redirection, as described above. Auth Accepted URL is where users land after successful consent, carrying an authorization code in the query string. Auth Declined URL is where users land if they abort or deny the consent. In the Developer Portal’s application settings, you must provide both URLs for your RuName. They can be distinct pages or endpoints. eBay does not attach an error message on decline (it typically just hits the Declined URL without a code), so your app should infer a decline if the user is redirected there (or if no code is present). These URLs need to be HTTPS in production for security (eBay may reject non-SSL callbacks). They allow you to give feedback: e.g., on the Declined URL page you might show “You did not grant access, so we cannot proceed.” If you don’t need a fancy decline page, you can even set the Declined URL to a generic page of your app that instructs the user to try again if they intended to connect. The key is that eBay requires these URLs up front, and uses them to route the user appropriately. They are critical for a smooth OAuth integration – without them, the user would be left on an eBay page with nowhere to go after login.

Access Token vs Refresh Token: eBay’s OAuth uses access tokens and refresh tokens for user authorization:

An Access Token is a short-lived token that grants access to eBay APIs. For eBay’s REST APIs, user access tokens typically expire after 2 hours (about 7200 seconds). The access token includes scopes (permissions) that determine what API calls can be made. You must include the access token in the Authorization: Bearer header of each API request. Once it expires, it can no longer be used to authorize calls.

A Refresh Token is a long-lived token tied to a user’s consent. When you perform the OAuth authorization code exchange, eBay returns both an access token and a refresh token. The refresh token is used only to obtain new access tokens (it cannot be used directly to call APIs). Refresh tokens on eBay are valid for an “extended period.” Officially, that period is on the order of 18 months (per eBay FAQs, user tokens expire after ~18 months). This means you can continue to refresh without asking the user to log in again for up to 1.5 years, as long as the user doesn’t revoke access or eBay doesn’t invalidate the token.

Token Properties: The access token carries the specific OAuth scopes that were granted. A refresh token typically has the same scope set and is tied to the same user. When you use a refresh token to get a new access token, the new access token will have the same scopes as the original (you can request a subset if desired, but not new scopes beyond what was originally consented). eBay’s refresh token grant is non-rotating – the same refresh token can be used repeatedly until it expires or is revoked. eBay does not issue a new refresh token on each use (unlike some OAuth providers); they expect you to re-use the one given originally. (If a refresh token does get renewed or changed by eBay, they will include it in the response, but typically it remains constant.)

Security of Tokens: Access tokens are short-lived for security, whereas refresh tokens are long-lived and thus more sensitive. Both should be protected, but refresh tokens especially should be stored in a secure place (server-side database or encrypted storage). Never expose a refresh token to the end-user or in client-side code, because it can be used to mint new access tokens for potentially a long time. Access tokens, while short-lived, also grant privileges and should be handled carefully (e.g. do not log them or send them to unintended recipients). If you suspect a refresh token is compromised, you should revoke the token (e.g., call eBay’s revoke token API or remove the user’s authorization) and have the user re-authenticate.

Revocation and Expiry: Users can revoke an application’s access in their eBay account settings, which invalidates the refresh token. Also, eBay may revoke tokens in certain cases (user changed their password or account name, security issues, etc.). Your integration should be ready to handle a refresh token that suddenly stops working (the token endpoint might return an invalid_grant error). In such cases, you must initiate a new OAuth consent flow to re-authorize the user. Additionally, when the ~18-month lifetime of a refresh token is reached, it will expire – at that point, the next refresh attempt returns an error and you need to get the user to log in again. It’s good practice to track the age of the refresh token and proactively re-auth before expiration (e.g. send the user through OAuth again after 17 months to renew their credentials).

Recap: The client ID and secret authenticate your app, RuName orchestrates your OAuth redirect URLs, and access vs refresh tokens manage short vs long-term authorization. Keep these concepts clear: use the access token for API calls, use the refresh token to renew access behind the scenes, and protect all secrets/tokens diligently.

4. OAuth Authorization Code Flow (Authoritative)

The Authorization Code Grant is the core OAuth flow for eBay user authorization. Below is a step-by-step breakdown of how to implement it for a typical app with a backend server (this covers a scenario like a mobile or web app that talks to a backend):

User Login Initiation (Client → eBay): When your user needs to connect their eBay account, your application should direct them to eBay’s OAuth authorization URL. Construct the URL as follows (for production or sandbox as appropriate):

https://auth.ebay.com/oauth2/authorize?client_id=<CLIENT_ID>&redirect_uri=<RuName>&response_type=code&scope=<SPACE-SEPARATED SCOPES>&state=<STATE>


For example (sandbox usage wrapped for readability):

GET https://auth.sandbox.ebay.com/oauth2/authorize?
    client_id=YourAppClientID&
    redirect_uri=YourApp_RuName&
    response_type=code&
    scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope%2Fsell.inventory+https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope%2Fsell.account&
    state=ABC123


Parameters:

client_id: Your eBay application’s Client ID (use the one for the correct environment).

redirect_uri: Your application’s RuName value (URL-encoded if necessary). This tells eBay which callback URLs to use. Do not put an arbitrary URL here; it must exactly match your RuName.

response_type=code: In the auth code flow, this is fixed to "code", indicating we want an authorization code back.

scope: One or more OAuth scopes your app needs, space-separated (and URL-encoded). Each scope corresponds to a set of API permissions (for example, sell.inventory for Inventory API, sell.account for Account API). You should request all scopes needed for the actions your app will perform. If multiple, separate by a space (which must be encoded as %20 in the URL). eBay’s documentation provides the exact scope strings for each API.

state (optional but recommended): A random string your app generates to correlate the request and response (helps prevent CSRF). eBay will return this same value to you untouched. Use it to verify the response belongs to a request you initiated.

When the user navigates to this URL (e.g. your app opens a webview or the user’s browser), eBay will prompt them to sign in (if not already) and then show the Grant Application Access page for your app. This page will display your app’s name (Display Title) and the list of permissions (scopes) you are requesting. The user can either “Agree and Continue” to grant access or “Not now” to decline.

User Grants or Denies Access (eBay → Your Redirect): After the user makes a choice:

If the user clicks “I Agree”, eBay will redirect the user’s browser to your Auth Accepted URL (the one associated with the RuName). This will be an HTTP redirect to your site with query parameters appended. Specifically, you will receive:

code: The authorization code, a short-lived single-use token (often ~700+ characters). Example: code=v^1.1#i^1#... (URL-encoded string).

state: The same state value you provided (if you included one).

expires_in: (Sometimes provided) how many seconds the code is valid (typically around 300 seconds = 5 minutes).

The authorization code is the key to the next step. Important: The code expires quickly (in 5 minutes), so your app should promptly proceed to exchange it for tokens. Also note, the code can only be used once – if you try to reuse it, it will fail.

If the user clicks “Not now” (or if any error occurs), eBay will redirect to your Auth Declined URL. In this case, you will not get a code parameter. Instead, you might get an error and error_description in the query (for example, error=access_denied if the user denied the request). However, eBay might simply redirect with no query params on user decline. Your app should detect that no code is present and treat it as a denial. At this point, no further OAuth steps happen – you should handle this gracefully (maybe notify the user that connection was not completed, and offer to retry if needed).

In either case, eBay’s OAuth server directs the user back to your application’s web endpoint. This is why that endpoint must be able to handle GET requests and parse query parameters.

Backend Exchanges Code for Tokens (Your Server ↔ eBay): Assuming the user granted access and you received an authorization code, your backend server should now exchange the code for an access token and refresh token. This is done by making a token request to eBay’s OAuth token endpoint. This is a server-to-server POST call (the user’s browser is no longer involved). Construct an HTTP POST to:

Sandbox: https://api.sandbox.ebay.com/identity/v1/oauth2/token

Production: https://api.ebay.com/identity/v1/oauth2/token

(Use the endpoint matching your environment).

Headers:

Content-Type: application/x-www-form-urlencoded (the token API expects form-encoded data).

Authorization: Basic <Base64Encode(ClientID:ClientSecret)>. This is HTTP Basic auth using your app’s credentials. You combine client_id:client_secret and Base64-encode them, then prefix with "Basic ". For example, if ClientID = abc and Secret = 123, the header would be Authorization: Basic YWJjOjEyMw==. (Use the proper keys for sandbox or production as applicable.)

POST Body: (Form fields)

grant_type=authorization_code – indicates the OAuth grant flow.

code=<the_code_you_received> – the authorization code from the previous redirect (URL-encoded). Be careful to supply the exact code value. (If your web framework auto-decoded the % encoding, ensure it’s properly transmitted. eBay expects the code either URL-encoded in form or as originally given; double-encoding can cause issues. Typically, just send it as-is.)

redirect_uri=<YourRuName> – Yes, you must include the same redirect URI (RuName) here. This is how eBay verifies that the code is being exchanged by the same application that initiated the request. If this value doesn’t match exactly what was used in the authorize step, you’ll get an error (unauthorized_client or invalid_grant). Important: Use the RuName string (the same one used in the authorize URL), not the full URL. This must match what’s on file for the code.

(No client_id/secret in body – those are provided via the Basic auth header instead.)

Example form body: grant_type=authorization_code&code=V%5E1.1#i%5E1...&redirect_uri=YourApp_RuName (with proper encoding).

Token Response: If everything is valid, eBay will respond with a JSON payload containing:

access_token: The OAuth access token (a long string, usually JWT format).

refresh_token: The refresh token (also a long string).

token_type: “Bearer”.

expires_in: The access token expiration time in seconds (typically 7200 for 2 hours for user tokens).

refresh_token_expires_in: (if provided) refresh token expiration in seconds (this might or might not appear; if it does, it’s on the order of millions of seconds – ~18 months).

scope: list of scopes the token is valid for.

Your backend should store these tokens securely. At this point, the user is fully authorized. You can consider the OAuth handshake complete. You would then likely inform the client app (if you have a mobile or web frontend waiting) that the auth succeeded – e.g., close the webview and pass a message, or redirect the user in your app.

Using the Access Token (API Calls): With the access token in hand, your application can now make authorized calls to eBay APIs on behalf of the user. Include the token in the Authorization header for each HTTP request:
Authorization: Bearer <access_token_value>.

The token grants access to the APIs covered by the scopes you requested. For example, if you obtained the scope for sell.inventory, you can now call the Inventory API to create listings for this user. If you call an API that requires a scope your token doesn’t have, eBay will respond with a 403 Forbidden error indicating insufficient scope. So ensure you request all necessary scopes up front (you cannot expand scopes without sending the user through a new OAuth consent flow).

The access token remains valid until it expires (eBay says user tokens expire after ~2 hours). You should track the expiration (from expires_in). If you call any API with an expired token, you’ll get HTTP 401 Unauthorized with an “Token expired” error.

Refreshing the Access Token (Keeping Session Alive): To avoid forcing the user to log in again every 2 hours, use the refresh token. When the access token is near expiration or has expired, your backend can automatically obtain a new one via a refresh token request. This is a POST to the same token endpoint (.../oauth2/token) with a different grant type:

Request:

Endpoint: https://api.ebay.com/identity/v1/oauth2/token (or sandbox equivalent).

Headers: same as before (Content-Type: application/x-www-form-urlencoded, Authorization: Basic ... with your app credentials).

Body fields:

grant_type=refresh_token

refresh_token=<the_refresh_token_value>

scope=<scope_list> (optional)

The refresh_token value is the long token your app saved from the original exchange. The scope parameter is optional – if omitted, eBay will issue a new access token with the same scopes as originally granted. You can include it to explicitly request a subset of scopes (you cannot add new scopes that weren’t originally consented). In most cases, you’ll omit it or send the full list again to maintain the same access.

Response: eBay will return a new JSON with a fresh access_token and a new expires_in. (The refresh token itself usually remains the same; refresh_token_expires_in might be returned to indicate remaining life.) Use the new access token for subsequent calls. You typically do not need to update the stored refresh token since it’s long-lived – continue using the original refresh token until it expires.

Refresh Best Practices: Use a refresh token only when needed. eBay enforces rate limits on token requests (both auth code and refresh grants). They allow a certain number of token generations per day per app. This means you should not refresh on every API call. Instead, cache the access token in memory or database with its expiry time. Only refresh when it’s close to expiring or has expired. For example, if your token lasts 2 hours, you might refresh it after ~1 hour 50 minutes or upon a 401 response from an API. This ensures you stay within eBay’s token rate limits. If you exceed the token request limit (for instance, calling the token service too frequently in a short time), eBay will return an error and you’ll have to wait (they don’t allow unlimited token churn). Usually, a single refresh token can be used to mint new access tokens indefinitely until the refresh token’s lifetime ends, so design your app to reuse it rather than repeatedly sending users through the web flow.

Common OAuth Errors and Troubleshooting:

“unauthorized_client” (401 Unauthorized during auth): This error is returned on the /authorize URL redirect if the client app is not recognized or allowed. Causes include:

Using the wrong environment’s credentials or RuName (e.g. a sandbox RuName with production endpoint). The eBay auth server will reject the request if client_id and redirect_uri don’t match a valid app in that environment.

A mismatch in the redirect URI. If the RuName in the auth URL doesn’t exactly match the one on file (including any encoding issues or case sensitivity), eBay refuses the request as not authorized. Make sure the redirect_uri parameter is exactly the RuName eBay gave you (often something like YourAppName-YourCompany-1234ABCD).

Not having set up a RuName or trying to use OAuth without configuring the callback URLs. E.g., if your app doesn’t have an Auth Accepted URL set, the OAuth request might be rejected by “client authorization authority (developer portal)” because the flow isn’t enabled for your app.

“The OAuth client was not found”: This message (in error_description) is essentially the same root cause as above – eBay cannot find the app for the given client_id in that environment. Double-check you used the correct Client ID and the correct host (sandbox vs prod).

invalid_grant (during token exchange): Happens if the authorization code is invalid or expired, or if the refresh token is invalid. For authorization codes: ensure you haven’t already used the code and that you exchange it within the expiration window (5 minutes). If you see invalid_grant on a refresh attempt, it means the refresh token is expired, or the user revoked access, or (less commonly) your app’s permissions were changed. In that case, you must send the user through a new OAuth re-consent. Another scenario: if your token exchange redirect_uri didn’t match, eBay may also throw an invalid_grant or unauthorized_client.

invalid_scope (on token request): If you request scopes that are not allowed for your application or misspell a scope, eBay could throw an error. Ensure your scopes are exactly as documented. Note that some API scopes (especially for restricted APIs) might not be available to your app unless granted by eBay. If you request a scope your app isn’t approved for, the authorize call might ignore it or the token call might fail. Typically, though, eBay’s OAuth will just issue tokens for the scopes that were assigned to your app in Dev Portal.

HTTP 401 “Token expired” (during API calls): This means your access token is no longer valid (timed out or revoked). The fix is to use the refresh token to get a new access token, then retry the API call. If refresh also fails (invalid_grant), handle as described (re-auth the user).

HTTP 403 “Insufficient permissions” (API calls): This indicates your access token is valid but does not have the scope required for that particular call. For example, if you attempt to create a listing but your token lacks the sell.inventory scope, you’ll get a permission error. The solution is to ensure you request the needed scope during OAuth. Each eBay API’s documentation lists the OAuth scope required. Always verify that the token’s scope list (you can decode the JWT or see the scope string eBay returned) covers the API you’re calling.

CSRF State Mismatch: If you use the state parameter for security, make sure to validate that the state returned by eBay matches what you set. If not, you should reject the response as it might be an injection. This isn’t an eBay error per se, but a security step; log and investigate if it happens (likely it means the flow was started from an unknown source).

General Tips: Always log enough information (not sensitive tokens, but error details) to understand OAuth failures in the field. Many times, issues boil down to configuration: wrong redirect URIs, using sandbox keys on prod, missing scopes, etc. Once configured correctly, the OAuth code flow is very reliable.

OAuth flow summary: The mobile or web client sends the user to eBay’s login/consent page, eBay returns a code to your backend via the redirect, your backend exchanges it for tokens using your secret, and then you use the access token for API calls (refreshing as needed). All steps must be done exactly as specified – any deviation (like wrong URLs, missing params) will cause an error. Adhering to the exact parameters and sequence from eBay’s documentation ensures a smooth authorization process.

Finally, note that eBay also supports a Client Credentials grant flow (for “Application” access tokens that are not tied to a user). Those are used for public data or certain resources (like browsing marketplace data) and involve just your client_id and secret without user interaction. That flow yields an app token but no refresh token (since you can just request another when it expires). If your integration needs only to access non-user-specific data (e.g. searching products via the Buy/Browse API), you might use the client credentials flow instead (it’s simpler). However, for anything that accesses or modifies a user’s account (listing items, retrieving orders, etc.), the authorization code flow described above is required.

5. API Domains & Base URLs

eBay’s APIs are organized into multiple domains (platform areas), each with specific base URLs and purposes. It’s crucial to use the correct endpoint for the API you need. Below is a breakdown of major API families and their base URLs:

OAuth / Identity API: As covered, the OAuth endpoints are https://auth.ebay.com/oauth2/authorize for the user consent page, and https://api.ebay.com/identity/v1/oauth2/token for token exchanges (with corresponding sandbox subdomains for sandbox). These endpoints handle authentication and authorization. The Identity API also has resources for getting info about the user’s OAuth profile if needed (and eBay’s legacy auth, which we won’t detail here).

Buy APIs (REST): The “Buy” API suite is for building buying applications (searching for items, accessing eBay listings, enabling purchases as a buyer).

The flagship here is the Browse API, which allows searching and retrieving details of active eBay listings as a buyer. Base path: https://api.ebay.com/buy/browse/v1/. For example, the Browse Search method is GET /buy/browse/v1/item_summary/search and Get Item is GET /buy/browse/v1/item/{item_id}. These return public listing info (title, price, seller feedback, etc) for active items. Scopes: Most Browse methods can use an Application token (no user needed), but some account-specific ones might need user tokens.

Other Buy APIs include the Feed API (to download daily item feeds, e.g. newly listed items by category), Deal API (to retrieve eBay deals and promotions), Offer API (used for things like placing proxy bids or Best Offers as a buyer), and Order API (for managing eBay guest checkout orders).

These all use the api.ebay.com/buy/... base. Not all buy APIs are available globally; eBay provides a matrix of which marketplace supports which Buy API. For example, the Marketplace Insights API (which provides historical sold data – more on that in Section 6) is listed under Buy APIs but is restricted.

Example domains:

Browse API: api.ebay.com/buy/browse/v1/

Feed API: api.ebay.com/buy/feed/v1/ (and a newer feed beta)

Deal API: api.ebay.com/buy/deal/v1/

Marketing API (Buy-side marketing, e.g. domain for merchandising to buyers): api.ebay.com/buy/marketing/v1/

Guest Order API: api.ebay.com/buy/order/v2/ (for guest checkout flows).
All these focus on the buyer perspective (searching listings, buying items, etc.). If you are building an app that compares prices or finds products on eBay, these are the APIs you’d use.

Sell APIs (REST): The “Sell” API suite is for seller-side operations (inventory management, listings, orders, account settings, etc.). They generally share the base pattern https://api.ebay.com/sell/ followed by the specific API name and version. Key Sell APIs include:

Inventory API: Base path https://api.ebay.com/sell/inventory/v1/. This is central for listing on eBay via API. It lets sellers create and manage inventory items and convert them into eBay listings (offers). You will use Inventory API to create products (with SKU), then create offers (price, quantity, category, etc.) and publish them (see Section 7). The Inventory API also handles things like inventory locations and item groups (variations). Scope: sell.inventory. This API is typically used in combination with Account and Compliance APIs.

Account API: Base path https://api.ebay.com/sell/account/v1/ (and /sell/account/v2/ for some newer resources). Account API manages seller business policies (payment, shipping, return policies), sales tax tables, user privileges, and seller programs. For example, you retrieve or create a fulfillment policy via Account API and then use its ID in an Inventory API offer. Scope: sell.account.

Fulfillment API: Base path https://api.ebay.com/sell/fulfillment/v1/. Despite the name, this is more about order management – it provides order retrieval and shipping fulfillment operations for orders once items are sold. You can get order details, mark orders as shipped, provide tracking, etc. This is the replacement for the legacy Trading API GetOrders and related calls. Scope: sell.fulfillment.

Finances API: Base path https://api.ebay.com/sell/finances/v1/. This API gives financial information, especially relevant for Managed Payments sellers. It provides data on seller payouts, transaction breakdown (sales, fees, adjustments). Scope: sell.finances. (Access to Finances API might be limited to sellers in managed payments, which is most sellers now.)

Analytics API: Base path https://api.ebay.com/sell/analytics/v1/. Provides seller performance metrics (like Seller Standards profile, service metrics for returns/cancellations). Scope: sell.analytics.

Compliance API: Base sell/compliance/v1/. Helps sellers check their listings for compliance with eBay policies (for example, listing violations or aspects that need updating due to policy changes).

Marketing API (Sell side): Base sell/marketing/v1/. Allows sellers to manage promotions, campaigns, and discounted pricing on their listings. (Note: Not to be confused with the Buy Marketing API – this one is for seller promotions.)

Negotiation API: Base sell/negotiation/v1/. Allows sending offers to buyers (e.g., Seller Initiated Offers to watchers of an item).

Metadata API: Base sell/metadata/v1/. Provides reference data such as eBay categories and features that are available for certain marketplaces.

Feed API (Sell side): Base sell/feed/v1/. This is different from Buy Feed. The Sell Feed API allows bulk download or upload of seller data via feeds. For instance, uploading large inventories or downloading order report files. It’s useful for high-volume sellers or those migrating data in bulk.

Finance, Compliance, Analytics, etc. all fall under the Sell umbrella and share the same OAuth user token (the user must be the seller). Each has its own scope (e.g., finances, compliance).

All Sell APIs require a User access token (since they act on behalf of a specific seller). They will not work with an application-only token.

The Sell APIs are designed to cover the full seller workflow. In summary: Inventory + Account to list items, Fulfillment to handle orders, Finances to track money, Analytics to gauge performance, etc. They are all RESTful and use JSON.

Legacy APIs (Traditional APIs): Before the modern REST APIs, eBay had SOAP and XML-based APIs such as the Trading API, Shopping API, and Finding API (collectively sometimes called the “eBay Traditional APIs”). These have different endpoints (typically https://api.ebay.com/ws/api.dll for Trading API SOAP, or specific REST-ish endpoints for Finding). Many of these are now deprecated or being phased out:

The Finding API (for searching listings, including completed items) was officially deprecated in 2025 and replaced by the RESTful Browse API.

The Shopping API (for product lookup) was also replaced by Browse API.

The Trading API is still partially in use for certain calls not yet in REST (e.g., some eBay Motors features, certain return flows), but eBay encourages using REST whenever possible. Trading API uses XML SOAP calls like AddItem to list items, etc. If you see references to “AddItem” or “GetSellerList”, that’s the old API. Our focus here is the REST Sell APIs, but be aware that the Traditional APIs exist. They use an older authentication (Auth’n’Auth or OAuth with different scopes) and different formats. They also have their own call limits, etc.

Post-Order API: This was a REST API for after-sale management (returns, cancellations, cases). It is being deprecated in favor of newer integrations. Portions of it have been replaced by the returns management in the Fulfillment API and other newer endpoints. In the deprecation notes, eBay lists many Post-Order API calls being decommissioned by early 2026. So going forward, one will use newer APIs for returns and disputes (some of which might not yet be publicly available as of writing, or are integrated into the Finances API for chargebacks, etc.).

Mapping APIs to Functions:

Listing (Seller side): Use Inventory API (with help from Account API for policies, Metadata API for categories, Compliance API for listing validation). The older alternative was Trading API’s listing calls, but those should be avoided for new implementations.

Order Management (Seller side): Use Fulfillment API to retrieve orders and update shipping. In legacy, Trading API’s GetOrders/CompleteSale did this.

Inventory & Product Catalog: Use Inventory API for your own inventory. If you need eBay’s catalog product details (like product specifics by ePID), there is also a Catalog API (under Commerce API domain, api.ebay.com/commerce/catalog/v1). Catalog API provides product metadata for eBay’s product catalog (primarily for ISBN/UPC lookups etc.), which can help in listing if you want to match products.

Account Management: Use Account API to configure selling profiles (policies) and check seller eligibility for programs (Global Shipping, etc.), and maybe opt in/out of programs (like Business Policies itself via optInToProgram).

Public Item Data (Buyer side): Use Browse API for active listings. For images, descriptions, etc., Browse API can fetch an item description if you use the proper fieldgroups.

Completed Items (historical sales): No public API for general use (Marketplace Insights is gated – see next section).

Analytics: Use Analytics API for seller metrics or traffic reports.

Notifications: There’s a Platform Notifications (Server-side) mechanism and a newer Webhook API for certain events. eBay can send notifications (via Gateway or via webhooks) for events like item sold, item listed, etc., if you subscribe. For example, a “ItemSold” notification can alert you when a listing sells. The newer method is the Notification API where you can subscribe to topics and eBay will send JSON webhooks to your endpoint.

API Base URL Summary:

RESTful (JSON) APIs: start with https://api.ebay.com/ plus the domain (buy/, sell/, or other commerce domains). e.g. sell/inventory/v1, buy/browse/v1, commerce/taxonomy/v1 (Commerce API domain includes Catalog, Taxonomy).

Legacy SOAP/XML: use api.ebay.com/ws/ endpoints or different subdomains (for example, svcs.ebay.com was used for Finding/Shopping). These require different integration techniques and are mostly deprecated.

When implementing, ensure you have the correct base URL and path for each API call. Using the wrong endpoint will lead to 404 or unexpected responses. The eBay Developer Program site provides an “API documentation” section for each API that clearly states the endpoint. For instance, the documentation for Inventory API will show path and methods under the Inventory API reference, and the Sell Feed API guide shows how to form feed requests. Always refer to those references to confirm you’re hitting the right URL with the right HTTP method.

In summary, map out the features you need and choose the corresponding eBay API:

Searching or buying items? Use Buy/Browse APIs (application token or user token for purchasing).

Creating or managing listings? Use Sell APIs (Inventory API for listings, Account API for policies).

Retrieving sales orders? Fulfillment API (sell).

Needing sold data for analytics? Possibly Marketplace Insights API (but access is restricted).

General market data or taxonomy? Commerce APIs like Taxonomy API for categories, Catalog API for product details.

User management? Not much needed; eBay doesn’t expose much user data via API for privacy. Use the token’s identity only as needed; there is an OAuth getUser call (GetUser API or Identity API) if you need the owner’s eBay user ID.

Keeping the API domains straight will help prevent calling wrong endpoints or using wrong tokens. The Official API Reference Index lists all the APIs and their purpose, which is useful to identify which one is authoritative for each area.

6. Pricing & Comps Data (Critical)

One of the most common needs for integration is obtaining pricing data and comparable sales (“comps”) either to price items or to analyze market value. eBay’s policies around this data are quite strict, and the availability of data differs for active listings vs sold listings:

Active Listings Data: If you want to retrieve data about currently listed items (active for-sale listings on eBay), you can use eBay’s public APIs:

The Browse API (under Buy APIs) allows you to search active listings by keyword, category, filters, etc., and retrieve details like current price, condition, seller info, etc. This is essentially a substitute for the old Finding API’s search. For example, the Browse search call can return up to 10,000 active items matching a query. You can filter by price range, condition, buying format, etc. to narrow results. This is the official way to get active listing prices and details programmatically. Browse API results include the listing price (price.value and currency), item specifics, seller username, and other info useful for comparisons.

The Browse API and affiliated Buy APIs do not require the seller’s authorization to fetch public listing data – you can use an Application access token (client credentials) to query public data. However, certain fields might require an affiliate partnership (for example, to get affiliate tracking links).

Another avenue: eBay’s Feed API (buy/feed) provides categorized item snapshots. It can give you a daily dump of active listings in certain categories (including their price). This is more for bulk data consumers and requires application token and possibly affiliate registration.

Active listing data is generally available to all developers within call limits. You can get current prices, number available, shipping cost (if provided in listing), etc. from these APIs.

Sold/Completed Listings Data: Historical sale data (what items actually sold for, when, and how often) is much more restricted:

eBay used to offer completed listing search via the Finding API (findCompletedItems) which returned past listings (including whether they sold and final price). However, that API is now deprecated and shut down. As of 2025, general developers no longer have an API to query sold item data across the site.

The official replacement is the Marketplace Insights API, which is a part of the Buy API family. Marketplace Insights was designed to provide historical sold data and metrics. For example, it could answer “What’s the average sold price of item X in the last 90 days?” or return a list of sold items for a query. However, eBay has made this API restricted. According to eBay’s documentation, “The Marketplace Insights API is restricted and not open to new users at this time.”. This means only selected partners or approved applications have access. If you are not explicitly granted access by eBay, you will not be able to use it. The OAuth scopes for it (https://api.ebay.com/oauth/api_scope/marketplace.insights) are likely not available to your app unless eBay enabled them.

For the average developer, sold listings data is effectively unavailable via API. eBay deliberately turned off broad access to sold item prices because of concerns (market research misuse, privacy, etc.). A community note confirms that the ability to search sold items was removed because it was being abused for market research contrary to policy.

Seller’s own sold data: A seller can get their own sales via the Fulfillment API (orders) – that’s transactional data for orders they received. But that’s not “comps,” it’s their actual orders. If you are building something for a particular seller (and you have their token), you can pull their order history (which includes sale prices) using Fulfillment API getOrders. That’s allowed because it’s their data. What you cannot do via API is retrieve another seller’s sales or aggregate market sales data broadly (unless you’re granted the Insights API).

In summary, for market-wide sold prices (comps), eBay does not provide an open API. Any current solutions that show eBay sold listings (like price guide tools) are either officially partnered or are scraping the site (which, again, is against eBay policy if done without permission).

Implications for Comps/Valuations:

Active Listings as Comps: Since sold data is mostly unavailable, many apps consider using active listings as an approximation of value. This is acceptable to an extent (you can show “currently on eBay, similar items are listed for $X”), but remember the earlier caveat: listing price ≠ selling price. Be careful to label such data appropriately (e.g., “Current listings asking price”) and not imply the item will sell for that price. Also note that active listings may be unsold inventory – multiple relists might indicate an item isn’t actually worth the asking price.

Required Disclosures: If you display eBay active listing data to users (for example, to show comps in an appraisal or a third-party site), eBay’s API License Agreement requires that you comply with their content usage policies. This often includes providing attribution that the data is from eBay and obeying any caching or freshness rules. For instance, if you use the Browse API data, and especially if you partake in the eBay Partner Network (affiliate), you usually must display that the data is from eBay and update it frequently (prices can change or listings end). Also, as noted, any price comparisons should not be misleading (FTC guidelines). So you may need to add disclaimers like “Prices shown are current eBay listings and may not reflect actual sale prices.”

No sold data for unapproved devs: If your use-case critically needs sold item data (completed listings), you likely cannot fulfill it via eBay’s public APIs unless you go through an approval process. You might reach out to eBay Developer Support to request access to Marketplace Insights API if you have a strong business case (some have tried – it’s generally reserved for select partners or internal use). The eBay community forums confirm that individual developers currently face a “significant hurdle” due to the lack of completed item data.

Alternatives / Other Data:

Some data about sold items is available to sellers for their own items via reports. For example, a seller can download a Sold Items report (via Feed API or File Exchange), but that’s only their sales.

eBay’s public website still shows completed listings if you manually search on ebay.com and toggle “Sold Items” filter. But automating that (scraping) is against policy. There are third-party services that offer eBay sold data scraping, but using those would violate eBay’s API License Agreement (and possibly legal issues), and eBay actively monitors and blocks scraping IPs.

If you’re doing “pricing comps” for, say, a resale app, one strategy is to use active listing prices as upper-bound and maybe factor in that sold prices tend to be lower. Some developers use the affiliate Feeds of eBay to gather large amounts of active listing data, then observe price drops or when listings disappear (assuming sold) – but that’s heuristic and not guaranteed.

Restricted APIs / Programs: eBay’s mention of “Restricted APIs” in the API License (those providing market trends, pricing strategy, etc.) hints that Marketplace Insights or similar capabilities exist but require special permission. If you become a large-scale eBay partner or have a direct agreement, you might get access to data like sell-through rates, average selling price, etc. For most, this is not available.

Compliance with Data Policies:

Because developers no longer can easily get sold prices, do not attempt to skirt this by scraping. If eBay detects an app scraping sold listings pages, they could revoke your API access entirely for violating terms. Also note, eBay forbids using their content to create price suggestions or competitive pricing tools without consent. This means if you are developing an app feature that automatically recommends a price for a seller’s item based on eBay data, you need to be careful. eBay’s terms specifically say an app shall not use eBay Content “to suggest or model prices” for eBay listings unless eBay has given prior permission. This is likely to prevent third-party apps from undercutting eBay’s own pricing guidance or doing things that might destabilize the marketplace pricing. If your app wants to do automated pricing (repricing, comp valuation), ensure you are compliant (possibly get approval or stick to providing data without explicit price recommendations).

Additionally, eBay prohibits “seller arbitrage” – like automatically repricing eBay listings based on other sites’ data or vice versa – that falls under Restricted Activities. Keep these rules in mind if your integration touches pricing.

Summary:

Active listing data: available via Browse API (with an app token) to use for showing current prices, listings, etc. This is your primary source of “comps” now, albeit comps of asking prices.

Sold listing data: Not available via any public API for general use. The only official API (Marketplace Insights) is not accessible to new developers. You cannot retrieve site-wide sold prices through eBay APIs unless specially approved.

Use of data: If you use active listings as a proxy for value, be transparent about it. Do not label an unsold listing price as “market value” without noting it’s unsold. Also, abide by eBay’s requirements: update data frequently (don’t show weeks-old prices as current) and include any required attribution. If you are in the eBay Partner Network (affiliate program), use the affiliate links returned by APIs and follow their guidelines for displaying pricing (e.g., some require showing “Buy It Now” price vs auction).

No cache of sold data: Since you can’t get sold data via API, ensure your users understand if you can’t display historical prices. Some apps choose to integrate with alternative data sources or allow users to manually input comps. But under eBay’s rules, you cannot use scraped sold data even if technically possible.

In conclusion, for pricing analysis, leverage active listing data legally accessible via eBay’s APIs, and design your application in compliance with eBay’s content usage policies and honest data presentation standards. If sold data is essential, consider contacting eBay for partnership or exploring if an eBay Affiliate could use some workaround (though affiliate APIs also don’t give sold info, just active). And absolutely avoid any unauthorized data scraping or usage that could jeopardize your API access.

7. Listing & Publishing Workflow

Creating eBay listings via API involves several steps and entities. The modern Sell Inventory API uses an inventory-based model: you first define your product in an inventory record, then create an offer tying that product to eBay marketplace details, and finally publish it as an active listing. Here is the official workflow and requirements, with no confusion:

Prerequisites – Business Policies & Settings: Before any item can be listed:

The seller must have Business Policies enabled and configured on their account. eBay requires every listing to specify a Payment policy, a Fulfillment (shipping) policy, and a Return policy. In the web interface, sellers often set these up as Business Policies (e.g., “Free Shipping Policy”, “30-Day Returns Policy”). In the API, these policies are referenced by their IDs. To use the Inventory API, the seller must opt in to Business Policies (this is a one-time action, via their account or via an API call to Account API’s optInToProgram for program “BUSINESS_POLICIES”). If a seller is not opted in, the Inventory API will not allow listing (calls will fail telling you to opt-in).

You need to retrieve or create the PaymentPolicyId, FulfillmentPolicyId, and ReturnPolicyId for the marketplace you’re listing on. Use the Account API v1 for this. For example, call getPaymentPolicies?marketplace_id=EBAY_US to get the seller’s payment policies for US, or use createPaymentPolicy to create one if none exist. The same for fulfillment (shipping) and return policies. Each policy has an id. You will use these IDs when creating the offer (listing). All three are required to publish an offer. (There are rare exceptions for certain eBay sites that might not require returns, but generally assume all three.)

The seller account must be in good standing and eligible to list on that marketplace. If the account has selling restrictions or hasn’t fulfilled seller registration, listing calls will error (e.g., “User has not registered as a seller” or selling limit exceeded errors). Ensure the account has a seller payment method on file etc. (For sandbox, use sandbox test users that are set up as sellers with feedback.)

Prerequisite – Inventory Location: eBay requires that inventory items be assigned to an inventory location. You must create at least one Inventory Location record via the Inventory API (createInventoryLocation) for the seller. This location represents a warehouse or storage from which the item ships or is stored. Even if you’re not using In-Store Pickup, eBay mandates a location. Each location has a merchantLocationKey (an ID you choose). You need to supply an address (country, and either city+state or postal code) for the location. That address is used to calculate shipping or show where the item ships from on the listing. After creating the location, you’ll reference its merchantLocationKey in your offer. If you don’t provide a location, you cannot publish (the publish call will fail saying merchantLocationKey is missing).

With those in place, here’s the step-by-step listing flow using Inventory API:

Create Inventory Item: Call createOrReplaceInventoryItem for the product you want to list. This defines the product’s details in the seller’s inventory. Required fields for an inventory item include:

A SKU (Stock Keeping Unit) that uniquely identifies the product in the seller’s inventory. The SKU is a custom string (you choose it; e.g. “SKU12345”). This is how you will reference the item later when creating the offer. SKU is required and is the key field for inventory items.

Product Title and possibly a Description (if you want a custom description on the listing, though note: eBay now often uses a separate API for descriptions or defaults to catalog product description if provided).

Category is not specified at this stage in the inventory item; category is set at offer level (because category can vary per marketplace).

Condition of the item (new, used, etc.).

Quantity available (if you plan to stock quantity; you can also choose to supply this later in the offer, but one of inventory item or offer must have quantity).

Price is not in inventory item (price will be set on the offer).

Item specifics/ product details: You can include any item attributes (brand, color, size etc.) in the inventory item’s product details. If you have a product identifier (UPC, EAN, ISBN, or eBay’s ePID), you can include it to match eBay’s catalog. There’s also a call to match inventory to catalog if you want eBay to fill details.

Product Images: You should add image URLs in the inventory item (up to 12 images typically). The Inventory API has an updateInventoryItem or you include images in the createOrReplace call. Alternatively, you can use the Media API to upload images and then attach via URL.

SKU-level specifics: If it’s a standalone item, all specifics go in one inventory item. If it’s a multi-variation (e.g., a shirt with color variations), each SKU (variation) might have specific values (color=Red for one SKU, color=Blue for another). Those can be set in item specifics and later grouped in an item group (next step).

The createOrReplaceInventoryItem call essentially upserts the record. If you call it again on the same SKU, it updates the info.

After this call, you have an inventory item record identified by SKU. Note, at this point, it’s not on eBay site yet; it’s just in the seller’s inventory database.

(Optional) Create Inventory Item Group: This step is only if you are listing a product with variations (multi-variant listing, like different sizes or colors under one listing). If so, you need to:

Use createOrReplaceInventoryItemGroup to define the group. You supply a inventoryItemGroupKey (your ID for the group) and list which SKUs belong to the group, plus the common aspects and variant aspects. For example, group “Shirt123” might contain SKUs “Shirt123-Red-M”, “Shirt123-Red-L”, “Shirt123-Blue-M”, etc. The group definition would say common aspects: Brand=XYZ, Model=Something; variant aspects: Color and Size.

This groups the inventory items so that when you create an offer, they can be published as one multi-variation eBay listing (rather than separate listings).

If you are only listing single-variation items, skip this.

Create Offer: Now you take the inventory item and prepare an offer which represents the eBay listing details. Use createOffer (or createOffer for single, createOffer repeatedly for each variation in a group scenario). Key fields for an offer include:

SKU: The SKU of the inventory item you are offering (for single variation) or the SKU of one variation (you’ll create one offer per variation in a group).

Marketplace ID: Which eBay site you are listing on (e.g. EBAY_US for ebay.com U.S., EBAY_GB for UK, etc.).

Format: FIXED_PRICE (for a Buy It Now listing). (Auction format via API is not common in Inventory API; the API primarily supports fixed price listings. Auction support is limited or requires a different approach. The format field might accept AUCTION if eBay allows via API, but as of latest docs, Inventory API is mainly for fixed-price. We specify FIXED_PRICE here).

Category ID: The eBay category under which to list the item. You must provide a category that is valid for the site. Use Taxonomy or Metadata API to lookup category IDs if needed. One category is required; a second (store category) is optional.

Listing policies: Provide the paymentPolicyId, fulfillmentPolicyId, and returnPolicyId here. These are the IDs obtained from Account API for the site. This satisfies payment, shipping, return requirements.

Merchant Location Key: The ID of the inventory location from which this item is available. This ties the offer to the location created earlier (for inventory count and shipping origin).

Quantity: How many units you want to make available on this listing. If you didn’t set quantity in the inventory item (or even if you did), you should set availableQuantity in the offer. The Inventory API allows quantity at either the inventory item level or offer level (the offer can override it). At publish time, eBay requires a quantity. If 0, it will create an Out-of-Stock listing (which is essentially inactive until you increase quantity).

Price: This goes in pricingSummary.price (value and currency). Set your Buy It Now price for the item.

Listing Duration: This can usually be omitted because fixed-price listings are Good ’Til Canceled by default on eBay. However, the offer schema has listingDuration which might be required in some cases. For fixed price, eBay will treat it as GTC (good until canceled), which auto-renews. If providing, you might set GTC (if that’s an allowed value) or a specific duration like P30D (ISO8601 format) if eBay allowed that (though eBay phased out anything but GTC for fixed price on many sites).

Lot Size (if applicable) and some other fields if needed (like quantityLimitPerBuyer to restrict how many each buyer can buy, etc.).

Variations: If this is part of a multi-variation, you create one offer per SKU variation, each with its own price/quantity maybe. However, note: In a group, categoryId and policies must be the same across all offers in the group. Only price/quantity and SKU differ per variation.

Charity (optional): Inventory API supports attaching a charity to the listing (see createOrReplaceInventoryItem or a separate call) if doing a charity listing.

Lot (optional): If your listing is a lot of items, you can specify lot size.

The createOffer call returns an offerId (an eBay-assigned ID for the draft offer). At this stage, the offer is in a “draft” state – not yet published on eBay.

You can review fees before publishing if needed by calling getListingFees (Inventory API provides an endpoint to retrieve expected listing fees for one or more offers). This will tell you insertion fee, etc., for the offers as drafted.

Publish Offer: Finally, once the offer is ready and you’re okay with any fees, you make it live by calling publishOffer (for single-variation) or publishOfferByInventoryItemGroup (for multi-variation group).

For a single offer, you call publishOffer with the offerId that was returned when you created the offer.

If it’s a multi-variation listing, after creating all the individual variant offers, you call publishOfferByInventoryItemGroup with the inventoryItemGroupKey to publish them all under one listing.

When you call publish, eBay will attempt to create the listing on the site. If something is missing or invalid, this call will fail with an error detailing the issue. For example, if you forgot to set merchantLocationKey or a policy, the publish response will return an error (HTTP 400) like “merchantLocationKey is required” or “returnPolicyId not specified” – because those are required fields for publishing even if the draft was created.

Required fields to successfully publish: Based on eBay’s documentation, the listing must have: an inventory location, quantity, SKU, category, price, all three policy IDs, condition, and compliance with any category specifics mandates. If any of these are missing, publishOffer will error out. (E.g., a common mistake is not assigning a category or not opting in to business policies.)

If publish is successful, the response will typically include the new eBay Item ID (the traditional 12-digit or so itemId) for the live listing. After publishing, the listing is active on eBay and buyers can find/purchase it. The Inventory API’s offer goes into PUBLISHED state.

eBay will start counting listing fees at this point. If it’s a scheduled listing, note that Inventory API doesn’t directly support scheduling start time as of writing; all offers publish immediately. To schedule, you’d have to delay calling publish.

Post-Publish Management: Once a listing is live:

If you need to update price or quantity, you can use Inventory API’s updateOffer for price/quantity or use the bulkUpdatePriceQuantity call for efficiency. For other edits (title, description, specifics), currently you might have to end and recreate, or if minor, use the legacy Trading API for revise (not ideal). eBay is expanding Inventory API gradually to support more revisions.

If you want to end the listing, there is withdrawOffer (to unpublish) or you can set quantity to 0 (if Out-of-Stock is enabled, the listing stays alive but hidden).

Orders that come in for that listing can be retrieved via Fulfillment API (they’ll reference the listing via SKU or itemId).

Inventory API provides webhooks or you can poll to know when quantity changes, etc.

Policy Requirements Recap: eBay requires payment, fulfillment, and return policy for each offer. In practice:

Payment Policy: defines how buyers pay. For most, this will be “eBay managed payments” so there aren’t multiple methods like old days – but you still need a policy (which might just say immediate payment required, etc.). If missing, publish fails.

Fulfillment Policy: defines shipping options (flat rate, calculated, local pickup, etc.). The policy must be set up for the listing site and possibly for the item’s category (e.g., freight shipping for big items). If you list on multiple eBay sites, you need site-specific policies. The Account API allows you to specify shipping services and costs in the policy.

Return Policy: defines whether you accept returns, within how many days, who pays for return shipping, etc. eBay mandates a return policy even if it’s “No returns accepted” (some categories might allow no returns). If the seller is in a region that requires returns (like on ebay.com, top-rated plus benefits require 30-day returns etc.), have to adhere to marketplace rules.

Error Handling in Listing Flow: If something is wrong in any step:

createInventoryItem can error if your JSON is invalid or a required field is missing (e.g., no condition).

createOffer will error if, for example, the category you provided is invalid or the SKU doesn’t exist, or a policy ID is wrong (maybe not belonging to that seller or site).

publishOffer will error if any required detail was omitted or if eBay has a category-specific requirement (like maybe you need to add an item specific for that category or the account has an listing violation block, etc.). It’s crucial to check the error messages returned. eBay returns a list of errors/warnings with codes and messages that pinpoint the issue.

There is a helpful document “Required fields for publishing an offer” which enumerates what must be set before publish – which we have essentially covered: SKU, quantity, price, marketplaceId, categoryId, all policy IDs, merchantLocationKey, condition, and if applicable, any mandates like item aspects that eBay enforces in that category (some categories require UPC unless you mark “Does not apply”).

Listing via API vs Web: One thing to clarify: The Inventory API route (Inventory Item → Offer → Publish) is the preferred method for integration, but eBay does have other listing APIs:

The Trading API has an AddFixedPriceItem call where you send everything in one XML payload (title, description, price, shipping, etc.). That is a legacy method and not recommended unless absolutely necessary (some edge cases or features not in REST yet). If you use Trading API, you still need to either provide shipping info or have Business Policies – you can actually reference Business Policy names or IDs in Trading API calls as well.

Since our aim is “source of truth” – the official stance is to use the RESTful Sell APIs. eBay’s documentation heavily guides new developers to Inventory API for listing management. The Inventory API also enables features like Out-of-Stock control (listings that can go to 0 quantity and be reactivated later without losing history) – which is a setting you can enable on the account.

Other Listing Requirements:

Item Specifics: Many categories have required item specifics (like Brand, MPN, etc.). If you don’t provide them, your listing might get blocked or get a warning. The API might allow the publish but eBay might flag it for missing specifics. Use the Metadata API or Taxonomy API which can tell you which aspects are required for a category. Ensure your inventory item or offer has those specifics. The Inventory API does have a compliance call to help identify missing info (Compliance API can check listings for violations or missing product details).

Variations: If listing variations, you must structure the data properly as described. All variant offers share the same title (usually) and only differ in the variant aspect in the title automatically appended (like “T-Shirt – Color: Red, Size: M”). The Inventory API handles that link.

Pictures for variations: If variants have different images (like a different color shirt has a different photo), you need to use the Inventory Item Group and the updateInventoryItemGroup or updateOffer to assign images per variant or variant aspect. This can be a bit complex – eBay typically expects you to assign which images correspond to which variant aspect (like all images showing the red shirt vs blue shirt).

EPA / Hazmat info: Certain categories require product compliance info (like if selling batteries, you need to provide battery info, etc.). These can be provided via the Compliance API or as item aspects. The “Energy efficiency” and “Hazardous material” guides in the Selling Integration Guide cover some specialized fields. Be mindful if you list in those categories.

Publishing Flow Confirmation: The official guide confirms:

For a single-variation listing: (1) createOrReplaceInventoryItem, (2) createOffer, (3) publishOffer.

For a multi-variation listing: (1) createOrReplaceInventoryItem for each variant, (2) createInventoryItemGroup, (3) createOffer for each variant (with same listing-level info except price/qty), (4) publishOfferByInventoryItemGroup.

Once published, the listing gets an Item ID. You can fetch the listing on the buy side by Item ID using Browse API’s getItem call (there’s also getItemByLegacyId if you have the old item ID, but in this case ItemID is the legacy id).

Policies Management: Just to reinforce: you use Account API to manage policies. For example:

createFulfillmentPolicy to create a shipping policy (you specify shipping options, domestic/international, handling time, etc.).

getFulfillmentPolicies to fetch existing ones.

Similar endpoints for payment and return. Many sellers will already have policies if they’ve sold on eBay before via the web (they might have default ones). You can choose to use existing ones (Account API has getPaymentPolicies etc., pick the one that suits and use its id).

Policies are site-specific. The policy IDs from EBAY_US won’t work on EBAY_UK listings. You need separate ones if listing on multiple sites.

Error Examples: If you try to publish without a policy, you’d get an error like (for example) “Publishing offer failed: Return policy not found” or some code. If you try to publish without a location, you get something like “missing required field merchantLocationKey” as mentioned.
If you try to list an item that is in a restricted category for the seller, you might get an error from compliance (e.g., listing weapons or something).
Also sellers have selling limits (a new seller can only list X items or $Y total until they establish history). If an API attempt exceeds those, eBay returns an error code (like code 21916013 – “You’ve hit your monthly selling limit”). Those need to be handled (usually the error message is clear, and the seller has to request higher limits or wait).

Order of Operations is Key: The sequence above must be followed. If you attempt to create an offer for a SKU that doesn’t have an inventory item yet, you’ll get an error (the API will say inventory item not found). If you attempt to publish an offer that’s missing data, it fails. So ensure each step completes successfully before moving on. The Inventory API is asynchronous-safe – i.e., you could create items and offers in bulk concurrently if different SKUs, but a single listing’s steps should be done in order.

In conclusion, the process to list an item through eBay’s API is well-defined and must be adhered to precisely:

Inventory Item (SKU with product details)

Offer (listing specifics like price, quantity, category, policies)

Publish (make it live).

All required information (location, policy IDs, etc.) must be in place by step 3. This modular approach allows you to manage inventory separately from marketplace listings – which is powerful (you can have one inventory item and create offers on multiple marketplaces if allowed, etc.).

Use the official eBay Selling Integration Guide and API references as the source of truth for all fields and workflows; we have distilled them here, but checking the exact request/response schemas in the API reference is recommended during implementation to avoid any field omissions.

8. Token Storage & Security Requirements

Handling eBay OAuth tokens and credentials requires careful adherence to security best practices and eBay’s requirements. eBay’s developer policies explicitly call for strong protection of user data and credentials. Here’s what you need to do:

Secure Storage of Tokens: All tokens (access tokens and refresh tokens) should be stored in a secure manner. Ideally, store them on your server in an encrypted database or key vault. Do not store sensitive tokens in plaintext. eBay expects developers to implement technical measures like encryption at rest, tokenization, and pseudonymization for any stored personal data. Access and refresh tokens are considered sensitive because they grant access to user data and actions. At a minimum:

Encrypt tokens in your database (for example, using a strong symmetric encryption key that is stored securely).

If you store tokens in memory (cache), ensure your application environment is secure (no unauthorized access to memory dumps, etc.).

Restrict access to the tokens in your system – only the processes that need to use them should be able to read them. Implement proper access control in your codebase or config.

Client Secret Protection: The eBay Client Secret (Cert ID) must never be exposed on the client side (mobile app, browser, etc.). It should reside only on your server. This means any OAuth token exchange or refresh logic should be implemented on the server. For a mobile app, this usually implies the app will open the eBay login page (or use a webview) and then either the app backend or a secure app redirect will handle the code exchange server-side. If you absolutely must do token exchange in a mobile app (not recommended), you cannot keep the client secret truly secret – but eBay’s model assumes you treat your app as a confidential client. So the expectation is to have a backend component. For web apps, never embed the secret in JavaScript or expose it. If someone obtains your client secret, they could impersonate your app to eBay’s OAuth service, which is a severe security breach.

Refresh Token Security: The refresh token is essentially a long-lived key to the user’s eBay account. eBay documentation stresses treating refresh tokens with high sensitivity. You should:

Store refresh tokens in an encrypted form, separate from less sensitive data.

Consider storing them in a secure vault service (like AWS KMS or HashiCorp Vault) if possible, especially if you have many tokens.

Not send refresh tokens to the client-side or reveal them in logs. Your server should use the refresh token to get new access tokens and then deliver only the new access token to the client if the client needs to make direct API calls.

Access Token on Client: Access tokens are short-lived and sometimes it’s necessary to use them in client-side contexts (for example, if your web frontend directly calls eBay APIs, or a mobile app does so). If you do this, take precautions:

Transmit the access token to the client only over HTTPS, and only store it in memory or secure storage (e.g., in a mobile app, use Keychain on iOS or Keystore on Android rather than plain prefs/files).

Never expose the token in URLs or in logs. If your app calls eBay from the client, ensure it’s using TLS (which it will, since eBay endpoints are HTTPS).

The token will expire in 2 hours, which limits the window of misuse if intercepted, but you should still protect it. Do not put it in browser localStorage without considering XSS risks; if in a browser context, prefer http-only cookies or in-memory storage and a short usage timeframe.

Server-Only Refresh: Ideally, do the refresh token grant on the server side exclusively. That way, the refresh token never appears in a client app. The server can then issue a new access token and either proxy requests or send the new access token to the client. Many implementations have the client not directly calling eBay at all; instead, the client calls the app’s backend, which then calls eBay. This is even more secure (the tokens stay on the server entirely). But if you design that the client calls eBay APIs directly (to reduce server load or latency), then you might hand the access token to the client, but still keep the refresh token server-side. When the client’s token expires, the client can either request a fresh token from your server (which uses the refresh token) or trigger the refresh flow on the backend.

No Sharing or Mishandling: eBay’s API License Agreement forbids exposing user data to third parties without consent. As such, do not share tokens or user data from eBay with other services unless explicitly allowed by the user and by eBay policy. For example, don’t upload eBay tokens to some cloud that isn’t secure or use them in contexts the user didn’t approve. Also, do not attempt to reuse a token for purposes other than intended (each token is issued for your specific app and scopes).

Encryption and Data Protection: eBay expects industry-standard security or better. This includes:

Using TLS 1.2+ for all communications (eBay endpoints require it anyway).

Storing personal data (which includes anything about eBay users, such as their tokens, names, etc.) in compliance with privacy laws. If your app downloads any personal info (like buyer addresses from orders), those too must be stored securely. The license mandates compliance with regulations like GDPR, etc., which means you should have data retention policies and secure deletion as appropriate.

Implementing measures to prevent unauthorized access – e.g., use proper authentication and authorization in your app so that one user’s tokens or data cannot be accessed by another. If you run a multi-user system, isolate each user’s eBay data.

Monitoring for malicious activity – e.g., if a refresh token is used unexpectedly or multiple times (could indicate a leak), consider invalidating it.

Token Rotation & Revocation: eBay tokens (especially refresh tokens) last a long time. Consider implementing a rotation strategy for your own safety:

Although eBay doesn’t rotate refresh tokens on use, you could periodically trigger a full re-auth for a user as a means of rotation (for instance, every 12 months re-auth even if token still valid, to pick up a new token and invalidate the old).

Provide a way for users to disconnect their eBay account from your app, which would involve discarding their tokens and perhaps calling eBay’s revoke token endpoint to invalidate any outstanding refresh token.

If you ever suspect a token is compromised, you should call the eBay API to revoke it (there is an OAuth revoke endpoint documented in eBay API as well) or instruct the user to revoke access via eBay account settings.

Compliance with eBay Security Audit: eBay’s terms mention they reserve the right to audit your security measures. Be prepared to explain how you store and secure data. If you were ever subject to an audit or needed to fill a questionnaire, you’d want to say: tokens are stored encrypted with AES-256 in our database, secrets are in an HSM, only backend has access, etc. This level of precaution is wise not just for eBay but for any third-party OAuth.

Logging: Avoid logging full tokens or secrets. If you must log something for debugging, mask out most of the token (e.g., log only last 4 characters). The tokens are JWTs – they can be quite large and include sensitive info (like eBay username as part of the JWT payload possibly). Logging them could inadvertently expose them in log files. So sanitize logs.

Front-end vs Back-end operations:

Token exchanges: Always back-end.

API calls: Could be either. For critical actions (like listing an item or retrieving financial data), you might prefer going through your backend for additional logic and to hide the token usage. For less sensitive or high-frequency calls (like continuously polling inventory counts or searching eBay), you might allow direct calls from client with an access token. In either case, manage carefully how tokens are delivered and refreshed.

Session management: If your app has its own login for users, you might not want to tie eBay token lifetimes to your app session directly (since eBay token might outlast your session or vice versa). Consider storing eBay credentials separately from your session tokens. Also, if your user logs out of your app, decide if you keep their eBay token stored for next login (likely yes, because the user authorized it and you may want to keep that link until they revoke). But ensure that if a malicious party gains access to your app account, they can’t easily extract the eBay token. This might involve not sending the token to the client unless needed, and definitely not showing it in UI.

Password and PII: While not specifically about tokens, note that eBay’s policies forbid storing eBay user passwords (which you wouldn’t anyway in OAuth) and any Personal Identifiable Info must be protected. If your app stores user’s eBay username or shipping addresses from orders, treat that data with care as well under the same encryption/secure storage standards.

Refresh Token Expiration Handling: When a refresh token eventually expires (18 months or user revocation), your app should handle the resulting error from the refresh attempt gracefully (no infinite retry). At that point, you must consider the token invalid and perhaps notify the user to re-connect their eBay account. It’s good practice to have a mechanism (email or in-app notification) to alert the user “Your eBay connection has expired, please reauthorize” when this happens. Keep in mind user might have revoked access proactively; you should handle that scenario.

No Long-Term Caching of User Data Without Need: eBay’s data access is meant for specific use cases. Don’t cache large amounts of eBay data indefinitely “just in case,” especially if it’s personal or sensitive (like lists of user’s sold items or buyer info). Use it as needed and purge if no longer required. For example, if a user disconnects their eBay account from your app, delete their tokens and possibly their data fetched via those tokens unless you have a legitimate reason to retain (and if you do, ensure your privacy policy covers that).

Honoring Data Protection (GDPR/CCPA): If a user requests their data deletion or if eBay notifies you of a user account deletion (they have a GDPR deletion notification API), you must delete their data from your systems. eBay’s developer terms enforce compliance with such privacy laws.

In summary, design your system such that eBay credentials are locked down:

Only exchange and store tokens on trusted servers.

Encrypt and restrict access to those tokens at rest.

Never leak tokens or secrets in client-side code, URLs, or logs.

Use refresh tokens judiciously and keep them out of user hands.

Monitor and respond to any potential security incident involving these tokens.

By following these practices, you align with eBay’s requirements and generally good OAuth security. This protects both you and the eBay users who have entrusted your application with access to their accounts. eBay’s documentation and terms essentially demand this level of diligence, and not doing so could lead to suspension of your API access or worse (not to mention harm to users). Always err on the side of caution with credential handling.

9. Error Conditions & Debugging Guide

Integrating with eBay’s APIs involves handling various error responses. Below is a guide to common error conditions, their meanings, and how to debug and resolve them:

HTTP 400 – Bad Request: A 400 status indicates the request was malformed or missing required data. The eBay API will usually return a JSON error response detailing what is wrong. Common causes:

Missing or Invalid Fields: If you omit a required field in the request payload, eBay will respond with an error message specifying which field is missing/invalid. For example, calling createOffer without a categoryId or pricingSummary.price will yield a 400 with an error like “Category ID is required” or “Price is required”. Similarly, publishing an offer without a location gives a validation error. The fix is to supply the required field with valid data.

Malformed JSON or Parameters: If your JSON is syntactically incorrect (e.g., trailing comma, wrong data type for a field), you’ll get a 400. The error message might be generic “Invalid JSON” or a specific pointer to the field that has type issues. Use a JSON validator on your request if you suspect this.

Invalid Enum or Value: If you provide a value that’s not allowed. E.g., sending condition="NewOther" when only certain enums are allowed might trigger a 400 with an error.

Combination Errors: Some fields are conditionally required. For example, when listing a multi-variation item, if you don’t provide variation aspects correctly, eBay might error that the request is invalid. The error message helps clue in which part is wrong.

OAuth Token in Wrong Format: If you forget the Bearer prefix in the Authorization header or provide a token that isn’t a JWT, eBay may return 400 or 401 (depending on how malformed it is). Ensure your Authorization header is exactly Bearer <token>.

When you get a 400, always read the error response JSON. It typically contains:

{
  "errors": [
    {
      "errorId": 12345,
      "domain": "API_DOMAIN",
      "category": "REQUEST",
      "message": "Descriptive message of the issue",
      "parameter": "fieldName" (sometimes)
    }
  ]
}


The message and possibly parameter will tell you what to fix. For example, eBay might say “The value provided for ‘aspect.brand’ is too long” or “Invalid fulfillmentPolicyId”. Adjust your request accordingly and retry.

HTTP 401 – Unauthorized: A 401 means the request lacked valid authentication.

Missing Token: If you call a REST endpoint without an Authorization header or with an empty token, eBay will respond 401 (and likely with an errorId about missing authentication). Always include a valid OAuth access token in each API call.

Expired or Invalid Token: If your access token has expired or been revoked, eBay returns 401 with an error like “Token expired” or “Invalid access token”. The solution is to refresh the token (if expired) or re-authenticate if it’s revoked.

Wrong Token Type: If you accidentally use an Application token for a resource that requires a User token, eBay will treat you as unauthorized. For instance, calling createOffer with an app token will yield a 401 “Unauthorized” because that call requires a user context. Ensure you use a User access token (with appropriate scopes) for seller actions, and an app token only for truly app-level calls.

Incorrect OAuth flow usage: If you see error_description “client credential required” or similar, it might mean you tried to use a user token where app token needed or vice versa. But generally 401 is token missing/expired.

Signature error (for legacy): For Traditional APIs, 401 can also mean your request signature (for old Auth’n’Auth) is wrong, but if you stick to OAuth, that’s not relevant.

If 401, log the user out of that flow or initiate token refresh. Do not keep retrying 401 with the same token; it won’t magically succeed. Get a new token.

HTTP 403 – Forbidden: This implies authentication was provided, but the user/app lacks permission to perform that operation.

Insufficient Scope: The token is valid but doesn’t have the required scope for the API. For example, you call an Inventory API with a token that was only granted scope=buy.offer or an unrelated scope. eBay will respond with a 403, often with an error message about permission. The remedy is to obtain a new token with the correct scopes for that call. Always check the API documentation for the required OAuth scope and ensure the token was minted with it.

API Access Revoked or App Suspension: If eBay suspended your API keys or the user’s ability to call an API (maybe due to violation or the user is blocked from selling), you could see 403. The error message would indicate if the application has been blocked or the user has a restriction. For example, if a seller is blocked from listing (maybe for policy violations), attempts to list might result in a 403-ish error with a message about account restriction.

Feature not allowed: Some calls might be forbidden if the account is not eligible. E.g., trying to use the Finances API for a seller not in managed payments might return a forbidden-type error. The message will explain “The user is not a managed payments seller” or such.

Marketplace or Account Constraints: If you try to list on a marketplace the user is not registered for, you may get a 403 or error. For instance, trying to list on EBAY_DE (Germany) with a US-only account might be forbidden.

Sandbox quirks: In sandbox, certain operations might return 403 if they are not supported in sandbox (though often they give 400 telling not supported).

Unauthorized resource access: For Buy APIs, if you attempt to retrieve something you shouldn’t (like another user’s order without proper authorization), you’ll get forbidden.

In case of 403, read the error message. If it says “OAuth scope invalid for this resource”, it’s scopes. If it says “Access to the specified resource has been denied”, consider if the user/app is allowed to do this action. You might need to guide the user (e.g., “Please ensure your eBay account meets the requirements to use this feature” if it’s an account-level block).

HTTP 404 – Not Found: This means the resource URL is incorrect or the identifier doesn’t exist.

Wrong Endpoint or Path: Check that you spelled the path and version correctly. For example, using /sell/inventory/v2/ instead of /sell/inventory/v1/ would yield 404 (no such endpoint). Or calling a method on the wrong API domain.

Invalid Resource ID: If you try to GET or update something by ID and that ID is wrong or doesn’t belong to the user, you’ll get 404. E.g., getInventoryItem("NonExistentSKU") returns 404. Or trying to GET /sell/account/v1/return_policy/1234567890 with an ID that doesn’t exist or isn’t yours yields 404.

Incorrect marketplace URL: Also ensure you’re using the right hostname. If you inadvertently use api.ebay.com vs api.sandbox.ebay.com or vice versa, you might get 404 or 401 depending on how the routing works (commonly 401/403, but 404 if that resource isn’t present at all).

Legacy API endpoints: If calling a legacy endpoint that’s been shut down, eBay might return 404 or a specific error. For instance, calls to Finding API after decommission could result in a 404 because the service is turned off.

If 404, double-check the endpoint URL and any IDs in the path. This is often a straightforward fix like correcting a typo or using the correct environment. For missing resources (like SKU doesn’t exist), handle it in your app (maybe inform user item not found, etc.).

HTTP 409 – Conflict: This typically arises in scenarios where the request could not be processed due to a conflict with the current state of the resource.

In Inventory API, if you attempt an operation that conflicts, such as creating an inventory item with a SKU that already exists when you intended a unique one, you normally wouldn’t get 409 because createOrReplace is idempotent. But if they had distinct create vs update calls, 409 could appear for duplicates (the current API design avoids that by using upsert).

A possible 409 is when publishing: if an offer is already published or the item is already listed via another route, you might get a conflict. Or if using bulkCreateOffer (if existed) with duplicate SKUs.

Another scenario: order fulfillments – if you try to ship an order that’s already shipped, you might get a conflict error.

The error message will explain. Handle by adjusting logic (e.g., don’t duplicate create, or check status before action).

HTTP 429 – Too Many Requests (Rate Limit): eBay enforces rate limits on API calls and on certain user actions:

If your application exceeds the call quota (daily or hourly call limits) for a particular API, eBay will start returning 429 errors for further calls until the window resets. The error might say “Rate limit exceeded” or “Too many requests”. The exact style can vary by API; some older ones might return a SOAP error code 518 or REST error code 160025 with message about call limit. The modern REST likely just gives HTTP 429.

Identify limit: Each API has documented call limits (ex: 5000 calls/day for Browse API for app, etc.). If you hit this, you should throttle your usage. Inspect response headers if present; sometimes eBay includes headers like X-RateLimit-Remaining and X-RateLimit-Reset (not sure if eBay does, but some APIs do). If not, rely on documentation.

If you get 429 for a specific user’s actions (like too many order modifications in short time or too many token refresh attempts), similarly back off.

Back-off strategy: Implement exponential backoff on 429. For example, wait a few seconds and retry, and if still 429, lengthen wait. However, if you’ve hit a daily hard cap, further retries won’t succeed until the day resets (GMT midnight usually). The error message might clarify (“exceeded calls per day” vs “per second”).

Check if it’s an application limit or user limit. e.g., Application call limit – shared across all users of your app. User-level rate limit – eBay imposes some limits per user for certain calls (like a seller can only revise listings X times per minute). The error text might mention user if so. In [59], error 21919144 is about a seller-level call rate being hit (1200 calls/30s).

Use eBay’s Analytics API -> getRateLimits (if available) to programmatically monitor your call usage. It can report how many calls you’ve made and remaining quota, which helps to avoid hitting the limit unexpectedly.

Business Rule Violations (Logical Errors): These are errors where the API call is well-formed and authorized, but eBay cannot complete it due to business logic. They often come as HTTP 200 with an errors array in the response (for SOAP they were warnings/errors, in REST they might use 4xx codes depending).

Selling Limit Exceeded: As mentioned, new sellers have limits (quantity or value per month). If your listing attempt exceeds those, eBay returns an error code (like 21919188 or similar) saying “Your account has exceeded the limit…”. This is not an HTTP auth error but a business error. The error category might be “Business” or “Application”. The solution is to inform the user (they need to request higher limits or adjust quantity/price to fit within limit).

Category/Item Violations: If you list in a restricted category (say prescription drugs, or products requiring approval like VeRO issues), eBay may block the listing. The API error might cite policy violation or “You are not allowed to list this item.” Compliance API can sometimes catch these beforehand. To fix, the user might need to get approval from eBay or choose a different category or remove a banned keyword from title etc.

Duplicate Listing: eBay generally prohibits duplicate listings (same item listed multiple times by same seller). If your attempt triggers that policy, eBay may return an error telling “Duplicate listing” or “You already have an active listing for this item.” Then you should not list a duplicate or perhaps use multi-quantity in one listing.

Payment Issue: If a seller’s account is not set up with a payment method for fees or they owe fees, listing might fail with an error indicating account issue. The user would need to address that on eBay (update payment method, pay fees).

Invalid Policy: Using a shipping policy that conflicts with item (e.g., freight shipping policy on a small item or vice versa) might return a warning or error. Or if a return policy is set to 60 days in a category that only allows 30, eBay might auto-adjust or warn.

For any error, the debugging approach is:

Read the error message (and code) carefully.

Consult eBay’s documentation or knowledge base if the message is not clear. Often the errorId can be looked up in eBay’s error documentation. For example, eBay has tables of error codes for Trading API (like error 21919144 we saw) and for REST, the code is often descriptive enough.

Reproduce the error in a controlled way. If unsure what’s wrong, try the call with minimal data or use eBay’s API Explorer (a tool on their site) to see if it provides more insight.

If still stuck, search the eBay Developer Forums for the error text – chances are someone else encountered it and there may be official responses.

Use sandbox to test changes if possible (keeping in mind sandbox differences).

OAuth-specific Failures: We covered these in Section 4, but for completeness:

unauthorized_client at authorization time – check your redirect URI and environment keys.

invalid_client – typically means your Authorization header for token request is wrong (maybe Base64 encoding wrong or using app key that doesn’t match).

invalid_grant – code used already or refresh token expired.

Always handle these by not retrying infinitely – these require user or developer action (fix config or re-auth user).

Handling eBay System Errors (5xx): Occasionally, eBay might have internal errors (500 Internal Server Error or 503 Service Unavailable). If you get a 500-class error with no fault of your own:

Log it with details and possibly the eBay errorId if any.

These are usually transient. Implement a retry logic for 500/503: e.g., wait a few seconds and try again (maybe up to 3 attempts).

Check the API Status page or the Developer Dashboard if there’s an outage reported. EBay might post on the Dev portal about any widespread issues.

If persistent, contact eBay Developer Support with the details of the error (they might ask for the errorId and approximate timestamp). There could be a bug on eBay’s side.

Debugging Tips:

Make use of eBay’s sandbox to simulate scenarios without fear of messing up real data or using real quotas. However, note that not all errors reproduce in sandbox (e.g., selling limit errors might not, since sandbox users often have unlimited).

Use API Explorer on developer.ebay.com: you can input request data and see the raw response. This helps confirm if your code or environment is the issue versus the request itself.

Check the case of IDs and values. Some APIs are case-sensitive for certain keys (although JSON keys are usually case-sensitive by spec).

Ensure you parse eBay’s responses correctly. Sometimes an error might actually come back as HTTP 200 with an “errors” block (especially in bulk calls or feed processing). Don’t assume success just from HTTP 200; inspect response body for any error indications.

Use correlation IDs: eBay often includes a header like X-EBAY-C-ENDPOINT or X-EBAY-CORRELATION-ID in responses. If you need to escalate an issue to eBay support, providing the correlation ID of an error response can help them trace it in logs.

Understand that error codes can differ between the RESTful API and legacy. Focus on the REST error structure for new integrations. eBay’s documentation for each API usually lists possible error responses.

Rate Limiting Strategy: If your application is hitting limits often (429s), consider:

Caching responses where possible instead of making repetitive calls (but ensure you respect eBay’s freshness requirements, especially for things like pricing).

Spreading calls over time or prioritizing important calls.

Using the Bulk endpoints if available (e.g., bulkGetInventoryItem instead of many individual get calls) to reduce call count.

Apply for higher call limits via eBay’s Application Growth Check if your use-case justifies it. They will require that your app is efficient and compliant before granting more.

Environment Mismatch Errors Recap: These can manifest in multiple ways:

Using a sandbox token on production: eBay’s production API will treat it as invalid (401). Vice versa similarly.

Using sandbox credentials in production OAuth: results in unauthorized_client at auth step as discussed.

If you notice that every call is failing with auth errors and you’re sure the code is correct, double-check you didn’t accidentally mix up the keys or endpoints for environment.

Developer Help: If an error is truly puzzling:

The eBay Developer Forums (community.ebay.com, under API Discussions) can be a good place. Often eBay moderators or experienced devs answer questions and might provide insight on cryptic errors.

eBay’s developer documentation sometimes has an “Errors” section listing common error codes for that API. For example, they might list error IDs for Inventory API in the API reference pages or guide.

eBay also has a Knowledge Base with specific KB articles about certain errors (like the one we saw for call limit error code 21919144). Searching the KB for an errorId might bring up something.

In practice, robust eBay integration means coding defensively: check responses for errors every time, have conditional logic to handle them (e.g., if token expired, refresh and retry once; if limit exceeded, schedule retry after delay; if validation error, inform user to correct input). Do not assume success on first try, especially for user-driven actions like listing an item – there are many business rules that could cause a listing to be rejected. Good error handling and messaging in your app will greatly improve the user experience (for instance, telling the user “Your item cannot be listed because your account has reached its monthly selling limit” rather than a generic “Listing failed”).

Let’s summarize some common error scenarios with causes and solutions in a quick list:

Error: “Unauthorized” (401) – Cause: Missing or invalid token. Solution: Add valid OAuth token or refresh it.

Error: “Forbidden – Scope or permission” (403) – Cause: Token doesn’t have required scope or user not allowed. Solution: Request proper scopes in OAuth or ensure user is eligible (e.g., has seller account).

Error: “You have exceeded your maximum call limit…” – Cause: Rate limit (app or user) reached. Solution: Throttle calls, wait for limit reset.

Error: “The token will expire after 18 months” – This isn’t an error, it’s from FAQ indicating token expiration timeline. Plan re-auth flow before then.

Error: “Invalid category ID” (400) – Cause: Using wrong category or out-of-date ID. Solution: Check category via Taxonomy API or update to current category.

Error: “Business policy ID not valid” – Cause: Using a policy ID from a different marketplace or that was deleted. Solution: Retrieve correct policy ID for that site using Account API.

Error: “The OAuth client was not found / unauthorized_client” in OAuth – Cause: Wrong environment or redirect URI mismatch. Solution: Use correct env endpoints and exact RuName.

Error: “Service Unavailable” (503) – Cause: eBay API downtime or maintenance. Solution: Retry after short delay, check status page.

By systematically analyzing the error responses and referring to eBay’s guidelines, you can resolve most integration issues. Always incorporate logging around API calls (but remember to scrub sensitive info) so you can troubleshoot issues in production.

In short, pay close attention to the error messages and codes eBay provides – they usually tell you what’s wrong. Use that info to adjust your request or handle the situation (whether that means correcting your application logic or prompting the user for something). This “source of truth” combined with eBay’s official error documentation will save you time and prevent frustration when debugging your eBay integration.

10. Official Source Index (MANDATORY)

Below is a list of official eBay documentation pages used as authoritative references in this guide, along with what each source is authoritative for:

eBay API License Agreement – Source for eBay’s platform rules, prohibited uses of data (scraping, price modeling), and security obligations. Authoritative for: Non-negotiable usage policies, data handling requirements, and restricted activities on eBay’s APIs.

eBay Developer OAuth Guides – Authorization Overview & Flows – Includes “Working with OAuth scopes”, “The authorization code grant flow” (Guides v2). Authoritative for: OAuth implementation details (endpoints, required parameters, RuName, accept/decline URLs, scopes, token exchange, refresh logic, common OAuth errors).

RuName Configuration Documentation (in OAuth guide) – Authoritative for: The role of Auth Accepted URL and Auth Declined URL, and how RuName encapsulates redirect URLs.

OAuth Best Practices (security section of the guide) – Authoritative for: Treating tokens and client secrets as sensitive, secure storage and immediate action on compromise.

eBay Sell API – Selling Integration Guide (Selling Integration Guide and Inventory API sections) – Authoritative for: The end-to-end listing workflow (Inventory Item → Offer → Publish), required fields for publishing, and the need for business policies and inventory location.

eBay Inventory API Reference – Specifically “Required fields for publishing an offer”. Authoritative for: All mandatory elements (policies, location, price, etc.) that must be set before an offer can be published, ensuring no confusion about what is needed to list an item.

eBay Account API (Account Management) – Authoritative for: Managing business policies (payment, fulfillment, return) and other seller account configurations, as well as the distinction between Account API v1 vs v2.

eBay Buy API Documentation – Browse API overview and methods, and Marketplace Insights API note. Authoritative for: Retrieving active listing data (Browse API usage) and the fact that Marketplace Insights (sold data API) is restricted/not available to new developers.

API Deprecation Status – Authoritative for: Confirmation that Finding API (which provided completed items) has been replaced by Browse API, and that older APIs like Shopping are deprecated, reinforcing the lack of a completed items search for general use.

eBay API Call Limits – Authoritative for: Default call limits for various APIs (application-level quotas), and guidance to perform an Application Growth Check for higher limits. Also mentions daily call cap per API.

eBay FAQs – User Tokens (Token expiration info) – Authoritative for: Token lifetimes (e.g., “The token will expire after 18 months”), user token 2-hour expiry, and general OAuth token usage tips.

eBay Developer Knowledge Base – Error Code 21919144 – Authoritative for: Example of a specific error (call limit exceeded) and eBay’s explanation, demonstrating how seller-level rate limits work. Helps to identify rate limit errors and proper interpretation.

eBay Developer Guide – OAuth Token Request (Refresh) – Authoritative for: The refresh token grant usage (endpoint, headers, payload including optional scope behavior), and the fact that scopes default to originally consented ones if not specified.

eBay Buy API – Marketplace Support – Authoritative for: Clarification of which APIs (like Offer API, Deal API, Marketplace Insights) are available on which marketplaces, and the restriction notice on Marketplace Insights API.

Selling Integration Guide – Business Policies requirement – Authoritative for: The need to opt-in to Business Policies and have all three (payment, return, fulfillment) set up to use Inventory API, as well as using Account API v1 to manage them.

eBay Developer Guides – Security Requirements (Data protection annex of API License) – Authoritative for: Required security measures (encryption, etc.) for developers in handling eBay data, justifying encryption of tokens and secure app design.