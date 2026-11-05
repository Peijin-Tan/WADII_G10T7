# FoodForThought
FoodForThought is a web application that simplifies meal planning and recipe discovery by helping users manage ingredients, find suitable recipes, and organise meals in one place.

FoodForThought helps users decide what to cook and encourages them to build sustainable home-cooking habits by reducing decision fatigue and making meal planning more convenient.

# GitHub Repository
GitHub Repository: https://github.com/Peijin-Tan/WADII_G10T7

# Application URL
https://wadii-g10-t7-beryl.vercel.app/

# Prerequisites
Before setting up the application, ensure the following are installed:

Node.js
pnpm
MongoDB (or a MongoDB Atlas account)
GitHub

# Application Setup
Step 1: Clone the Repository

git clone <GitHub Repository URL>
cd FoodForThought

Step 2: Install Frontend Dependencies

From the project root directory:
pnpm install

Step 3: Install Backend Dependencies

cd server
pnpm install

Step 4: Configure Environment Variables

Create a config.env file inside the server directory.
Configure the following environment variables:
MONGODB_URI=mongodb+srv://aechia2025_db_user:cNbrq0XfIXBizaen@waddev.stup2a2.mongodb.net/Foodforthought?retryWrites=true&w=majority
JWT_SECRET=d8a9e15932579ccc422c2c05818aa8bd86fdd60325a25b6d17e7cf6248ef692e
SPOONACULAR_API_KEY=b1c10acde3da43ff9b50dde0a8bc7c59

Ensure that MongoDB is running and the connection string is configured correctly.

# Running the application
Step 1: Start the Backend Server

From the server directory:

pnpm dev

The backend server runs at:

http://localhost:8000

Step 2: Start the Frontend Application

Open another terminal at the project root:

pnpm dev

Open the frontend URL displayed in the terminal (http://localhost:5173).

# Testing the application
The following test cases can be used to verify the main functionalities of FoodForThought.

Test case 1: Register a new account
Expected Result 1: User account is created successfully

Test case 2: Log in with valid credentials
Expected Result 2: User is logged in successfully

Test case 3: Search for recipes (i.e. chicken)
Expected Result 3: Matching recipes are displayed (i.e. all recipes with 'chicken' will be displayed)

Test case 4: View recipe details (click on a recipe card)
Expected Result 4: Recipe information and instructions are displayed (brings you to the correct recipe detail page)

Test case 5: Add a recipe to meal planner (click "add to today's mealplan button")
Expected Result 5: Recipe is saved and displayed in Planner (recipe added to the mealpan)

Test case 6: Add a recipe to multiple days
Expected Result 6: Recipe is saved for the selected dates

Test case 7: Update dietary preferences
Expected Result 7: Preferences are saved successfully

Test case 8: Add ingredients to pantry
Expected Result 8: Pantry items are saved and displayed

Test case 9: Log out
Expected Result 9: User is logged out successfully

Test case 10: Like Recipe (click on like button in recipe page)
Expected Result 10: Liked recipe shown in the community page

Test case 11: Comments on Recipe (in recipe detail page)
Expected Result 11: Comments added and displayed in recipe detail page (can also be found in community tab)

# Test Account Credentials
For user (You may register a new account through the application)

Email: peijin@gmail.com
Password: 12121212

For admin
Email: admin@foodforthought.com
Password: AdminPass123!

# AI Usage
We used AI during the ideation of our web application to provide inspiration for our initial idea and help us explore possible features. AI also supported our debugging process by helping us understand error messages which allowed us to resolve any errors. In addition, we used AI to assist in consolidating styles and colours that had a few discrepancies to improve consistency and maintainability across our web pages.
