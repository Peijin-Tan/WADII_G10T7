# FoodForThought
FoodForThought is a web application that simplifies meal planning and recipe discovery by helping users manage ingredients, find suitable recipes, and organise meals in one place.

FoodForThought helps users decide what to cook and encourages them to build sustainable home-cooking habits by reducing decision fatigue and making meal planning more convenient.

# GitHub Repository
GitHub Repository: https://github.com/Peijin-Tan/WADII_G10T7

# Application URL


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

## Automated tests
There are three levels of automated tests. All commands run from the `FoodForThought` folder.

| Level | Tool | Where | Needs a server? |
|---|---|---|---|
| Unit | Node test runner | `server/tests/*.test.js` | No |
| Component + integration | Vitest + Vue Test Utils | `src/**/__tests__/*.spec.js` | No (the API is faked) |
| End-to-end | Playwright | `e2e/tests/*.spec.js` | Yes (Express + MongoDB) |

### Unit, component and integration tests (no set-up needed)

```sh
cd server && npm install && npm test && cd ..      # backend unit tests
npm install
npx vitest run                                     # all component + integration tests
npx vitest run src/components/__tests__/Planner.spec.js   # one file
```

These are repeatable: the component tests replace the API with a fake server (`src/components/__tests__/fakeServer.js`)
and fix "today" with `vi.setSystemTime`, so results never depend on the date, the network or the database.

| File | Level | What it checks |
|---|---|---|
| `Planner.spec.js` | Component | Week navigation, day tabs, weekly stats, adding / swapping / removing meals, Cooked / Planned / Skipped and the pantry message, building the shopping list |
| `ShoppingList.spec.js` | Component | Sections in shopping order, pantry-covered items, filters, ticking items, own items, adding bought items to the pantry |
| `Pantry.spec.js` | Component | Categories, use-by labels, search and filters, add / merge / +/- / edit / remove, "What can I cook?", cups saved as g or ml |
| `App.spec.js` | Component | Navbar, account menu, log out, admin link, phone menu, footer, login guard on every members-only page, expired logins, login sending you back to the page you wanted |
| `MealFlow.integration.spec.js` | Integration | Each page with its REAL modals: Add Meal, Shopping mode, "What can I cook?", the "Are you sure?" dialog |
| `Dashboard.spec.js`, `Dashboard.integration.spec.js`, `DashboardAnalytics.spec.js` | Component / Integration | Dashboard greeting, monthly progress, community activity and analytics panels |
| `server/tests/integration.test.js`, `shoppingmode.test.js`, `shoppingcategory.test.js`, `ingredientnames.test.js`, `review.test.js` | Unit | Shopping-list maths: pantry subtraction, unit conversion (incl. cups of rice vs grams), ingredient-name matching, shopping-mode basket rules |
| `server/tests/userdelete.test.js` | Unit | Deleting a user also removes their pantry, plans, lists and Neighbour Pantry links, invites and borrow requests |

### End-to-end tests (real browser + Express + MongoDB)

1. Use a test database (recommended) or at least **separate test accounts**: the tests add data and remove it again.
   The database needs at least one saved recipe (Add Meal's "Quick Suggestions" picks the first one).
2. Start the backend with rate limiting off (a full run logs in many times and makes hundreds of requests,
   which would hit the normal limits after a run or two). **Only for local testing, never in production:**
   ```sh
   cd server
   DISABLE_RATE_LIMIT=true npm start                 # macOS / Linux
   $env:DISABLE_RATE_LIMIT="true"; npm start         # Windows PowerShell
   ```
   Playwright starts the Vite dev server itself.
3. Set the test accounts (first time only: `npx playwright install`) and run:

| Variable | What it is | Used by |
|---|---|---|
| `E2E_EMAIL` / `E2E_PASSWORD` | a regular **test** user | login, meal-planning, dashboard-activity E01 |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | an **admin** test user | login L02, admin, and removing the throwaway users the other tests make |
| `E2E_RECIPE_ID` | `_id` of any saved recipe | dashboard-activity |
| `E2E_API_URL` | optional, default `http://localhost:8000` | all |

```sh
# macOS / Linux
export E2E_EMAIL=test@example.com E2E_PASSWORD='YourPassw0rd!'
export E2E_ADMIN_EMAIL=admin@example.com E2E_ADMIN_PASSWORD='AdminPassw0rd!' E2E_RECIPE_ID=<a recipe _id>
npx playwright test                          # every journey in Chromium, Firefox and WebKit
npx playwright test --project=chromium       # one browser (fastest)
npx playwright test e2e/tests/recipes.spec.js --project=chromium   # one file
npx playwright show-report                   # HTML report afterwards

# Windows PowerShell: set each variable like this, then run the same commands
$env:E2E_EMAIL="test@example.com"; $env:E2E_PASSWORD="YourPassw0rd!"
```

| File | Test | User journey |
|---|---|---|
| `login.spec.js` | L01-L03 | User logs in -> dashboard greeting; admin logs in -> Admin Dashboard; wrong password -> error, stays on login |
| `meal-planning.spec.js` | J01 | Plan a dinner 8 weeks ahead, mark it Cooked and back, build the shopping list, add and tick your own item, add it to the pantry, find it on the Pantry page |
| | J02 | Pantry: add with a use-by date, "Use within 3 days", + button, edit, remove (Cancel first), every change survives a reload |
| | J06 | Rice typed in cups is saved in grams (2 cups -> 370 g) and merges in grams |
| | J03-J05 | Guest sent to log in and back to the page they wanted; navbar + log out; phone menu |
| `recipes.spec.js` | R01 | Create a recipe with a photo, open it from the Recipes list, add it to today's dinner (appears in the planner), edit it and delete it from Profile |
| `account.spec.js` | AC01 | Sign up, save dietary preferences (still ticked after reload), change password (wrong one refused first), log out, log in with the new password |
| `dashboard-activity.spec.js` | E01 | Add, edit and delete a recipe comment from Community; changes survive a reload |
| | E02 | Unlike a recipe on Community > My Liked Recipes; it stays removed after a reload |
| | E03 | Dashboard monthly progress (50%, "1 of 2 planned meals") matches the user's own plan and the API |
| `neighbour-pantry.spec.js` | N01 | Two users in two browsers: invite -> accept -> borrow flour -> approve; the flour moves from one pantry to the other |
| `admin.spec.js` | AD01 | Admin opens Users from the overview card, finds a user, deletes them (confirm dialog), checks Recipes and Comments sections |

# Test Account Credentials
For user (You may register a new account through the application)
Email: peijin@gmail.com
Password: 12121212

For admin
Email: admin@foodforthought.com
Password: AdminPass123!
