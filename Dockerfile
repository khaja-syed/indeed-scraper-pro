FROM apify/actor-node-playwright-chrome:20 AS builder

COPY --chown=myuser package*.json ./
RUN npm install --include=dev --audit=false

COPY --chown=myuser . ./
RUN npm run build


FROM apify/actor-node-playwright-chrome:20

COPY --chown=myuser package*.json ./
RUN npm install --omit=dev --omit=optional --audit=false \
 && npm cache clean --force \
 && echo "Installed npm packages:" \
 && (npm list --omit=dev --all || true) \
 && echo "Node.js version:" && node --version \
 && echo "NPM version:" && npm --version

COPY --from=builder --chown=myuser /home/myuser/dist ./dist
COPY --chown=myuser .actor ./.actor

CMD ./start_xvfb_and_run_cmd.sh && npm start --silent
