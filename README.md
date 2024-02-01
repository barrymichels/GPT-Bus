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

## Prompt used

After multiple attemts and failures, this is the prompt that I ended up using:

```
you are an expert javascript and web developer. write an app that tracks a single bus rental. it should have a login form, a dashboard that shows the current status of the rental (list of riders, their current balance, and the total funds collected and remaining funds to collect), a way to add a rider, edit their information, and add payments. Payments should be editable and deleteable. Information collected on each rider is: name, email address, and phone number. Riders should be able to reserve more than one seat.

App Style:
Use tailwind and use a dark theme
All forms should be displayed with a drop shadow and rounded corners

Login Form:
Simple form that is horizontally and vertically centered.

Change Password Form:
Simple form that is horizontally and vertically centered.

Add User Form:
Collect the new user's name, username, and password. Follow the app style.

Dashboard:
Header with logout, add user, and change password buttons in a dropdown menu.
Show a button for adding a new rider.
Show a table of existing riders.
Each entry in the rider table should show their name, number of seats reserved, and current balance.
Each entry in the rider table should have 2 actions: View payment history, and edit rider.
Under the rider table, show the cost of the rental, total funds collected as well as the remaining funds left to collect.

Add Rider Form:
Collect the rider name, email address, number of seats to reserve. Start the rider with a balance of Cost of seat * Number of seats reserved.

Edit Rider Form:
Same as 'add rider form', but pre-filled with data on the rider

View Rider Payment History:
Show the rider's information at the top.
Provide a button to add a new payment.
Below the rider info, provide a table of payments.
Each payment entry should have the date the payment was made and the amount paid.
Each payment entry should have 2 actions: Edit and Delete.
Deleting a payment should prompt the user with a confirmation modal.

Add / Edit Payment:
Provide a form to enter a new payment or edit an existing one.
The date should be changeable with a date picker.

The cost of the bus rental should be a const variable stored in the javascript code.

Technology to use: nodejs, express, passport, sqlite, pug, tailwind css (from CDN). Store user accounts, sessions, riders, and payments in tables in the local sqlite database. User login sessions should persist across server restarts. When node is restarted, users should be able to resume their session without logging in again. Users should be able to reset their password and logout. Create a default admin user with the password: password123.

Do not explain the code you write. Only provide code that can be copy and pasted into files. Do not summarize blocks of code. Do not leave "implement code here" comments. Write all code to make the app work. Do not leave any blocks of code for me to implement. You are the developer. Provide COMPLETE code. DO NOT OMIT ANY CODE FROM YOUR OUTPUT. IN EVERY CASE, WRITE THE ENTIRE FUNCTION.

DO NOT PROVIDE AN OUTLINE. DO NOT SUMMARIZE.

For your first response, write only the server.js file. Output NOTHING but CODE.
```

After walking ChatGPT through each file or set of files, the result was tweaked using GitHub Copilot. Extra features were also added using Copilot, for example, the emailed receipt.
