# BlogIDE production image: Next.js standalone server plus Pandoc and Typst,
# so Word import/export and Pandoc PDF export work out of the box.
#
#   docker compose up --build        (reads .env; see README → Docker)
#
# The Supabase URL and anon key are read when the container starts (see
# docker/entrypoint.sh), so one image works against any Supabase project and
# can be published as-is. The other NEXT_PUBLIC_* values are inlined into the
# browser bundle by `next build`, so they stay build args: change one and
# rebuild.

ARG NODE_IMAGE=node:22-alpine3.23
# Same Alpine release as NODE_IMAGE, so the libstdc++ copied below matches.
ARG PANDOC_IMAGE=pandoc/typst:3.8.3-alpine

FROM ${NODE_IMAGE} AS node

# ---- dependencies ----------------------------------------------------------
FROM node AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall copies Harper's WASM into public/vendor.
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund

# ---- build -----------------------------------------------------------------
FROM node AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_HOSTED
ARG NEXT_PUBLIC_BETA_ONLY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# Left empty, the Supabase pair builds as sentinels that the entrypoint
# replaces at startup. Pass real values only for a single-project image.
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-https://blogide-runtime-supabase-url.invalid} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-blogide-runtime-supabase-anon-key} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_HOSTED=${NEXT_PUBLIC_HOSTED} \
    NEXT_PUBLIC_BETA_ONLY=${NEXT_PUBLIC_BETA_ONLY} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM ${PANDOC_IMAGE} AS runner
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/lib/libstdc++.so.6* /usr/lib/

RUN addgroup -S blogide && adduser -S -G blogide -h /app blogide
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PANDOC_PATH=/usr/local/bin/pandoc \
    PANDOC_PDF_ENGINE=typst

COPY --from=builder --chown=blogide:blogide /app/.next/standalone ./
COPY --from=builder --chown=blogide:blogide /app/.next/static ./.next/static
COPY --from=builder --chown=blogide:blogide /app/public ./public
# Executable bit comes from git; plain COPY keeps it (no BuildKit needed).
COPY docker/entrypoint.sh /usr/local/bin/blogide-entrypoint

USER blogide
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/manifest.webmanifest || exit 1
# Replaces the base image's pandoc entrypoint.
ENTRYPOINT ["blogide-entrypoint"]
CMD ["node", "server.js"]
