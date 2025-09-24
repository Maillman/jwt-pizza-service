const request = require("supertest");
const app = require("./service");
const { Role, DB } = require("./database/database.js");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let adminUser;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;

  adminUser = await createAdminUser();
});

test("login", async () => {
  const loginRes = await request(app).put("/api/auth").send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );

  expectResponseUserToMatchTestUser(loginRes.body.user);
});

test("logout", async () => {
  testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

  await request(app)
    .delete("/api/auth")
    .send()
    .set("Authorization", `Bearer ${testUserAuthToken}`)
    .expect(200);

  testUserAuthToken = null;
});

test("getuser", async () => {
  //console.log(testUserAuthToken);

  testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

  //console.log(testUserAuthToken);

  const getUserRes = await request(app)
    .get("/api/user/me")
    .send()
    .set("Authorization", `Bearer ${testUserAuthToken}`);
  expect(getUserRes.status).toBe(200);

  expectResponseUserToMatchTestUser(getUserRes.body);
});

//Helper Functions

async function loginUserIfNeeded(user, token) {
  if (token == null) {
    //console.log("logging in user!");
    const loginRes = await request(app).put("/api/auth").send(user);
    expect(loginRes.status).toBe(200);
    //console.log(loginRes.body.token);
    return loginRes.body.token;
  }
  return token;
}

function expectResponseUserToMatchTestUser(resUser) {
  const { password: _password, ...user } = {
    ...testUser,
    roles: [{ role: "diner" }],
  };
  expect(resUser).toMatchObject(user);
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = "testAdmin";
  user.email = user.name + "@admin.com";

  await DB.addUser(user);
  user.password = "toomanysecrets";

  return user;
}
