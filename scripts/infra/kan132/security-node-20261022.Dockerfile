FROM node@sha256:0468540aa58203ff9e40c2aab3907c52644ab818af6176b1c70a026137dc92a2 AS patched_node
FROM evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339
COPY --from=patched_node /usr/local/bin/node /usr/local/bin/node
