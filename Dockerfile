# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
COPY package*.json ./

# Install project dependencies
RUN npm ci

# Copy the rest of the application's source code from your host to your image filesystem.
COPY . .

# Build the TypeScript project
RUN npm run build

# Use a smaller base image for the final stage
FROM node:18-alpine

WORKDIR /app

# Copy built artifacts and necessary production dependencies from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# The command to run the application
# This assumes 'kinetic-solana-cli' is set up in package.json's bin and globally linked,
# or that direct execution of the built JS file is intended.
# For a CLI tool, it's common to make it executable or use an entrypoint that calls it.
# Given the current package.json, we'll directly call the main script.
ENTRYPOINT ["node", "dist/index.js"]

# Document that the programId is an expected argument at runtime
# CMD ["<programId>"] # This is more for documentation in Docker Hub, ENTRYPOINT handles execution