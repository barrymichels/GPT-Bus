# GPT-Bus

This app was written using GPT-4. It tracks the riders and payments of a large bus rental.

## Getting Started

To get started with the GPT-Bus server, follow these steps:

1. Clone the repository
2. Install the dependencies: `npm install`
3. Configure the environment variables: Create a `.env` file based on `.env.sample`
4. Start the app: `npm start`
5. Open your browser: `http://localhost:3000`
6. Default admin account: admin / password123

## Docker

To run the GPT-Bus server using Docker, follow these steps:

1. Build the Docker image: `docker build -t gpt-bus .`
2. Run the Docker image: `docker run -p 3000:3000 -v ./db:/usr/src/app/db -d gpt-bus`
