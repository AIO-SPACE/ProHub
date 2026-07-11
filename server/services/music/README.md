# Music Sky provider

Music Sky translates the domain behavior used by Echo Music into ProHub's Node
provider layer. The Android app itself is not embedded and its Compose, Room,
and Media3 layers are not copied into ProHub.

The live catalog uses `youtubei.js`, normalizes provider objects before they
reach the API, proxies streams through ProHub, caches provider metadata under
`server/music/cache`, and sends downloads through the existing aria2 service.

Echo Music was used as an architectural reference and is GPL-3.0 licensed.
`youtubei.js` is an independent runtime dependency; retain its license notices
when redistributing ProHub.
