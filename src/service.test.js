const request = require("supertest");
const app = require("./service");
const { Role, DB } = require("./database/database.js");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let testUserId;

let adminUser;
let adminUserId;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  testUserId = registerRes.body.user.id;

  [adminUser, adminUserId] = await createAdminUser();
});

test("login", async () => {
  const loginRes = await request(app).put("/api/auth").send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );

  compareUsersButStripPassword(loginRes.body.user, testUser);
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

test("get-user", async () => {
  //console.log(testUserAuthToken);

  testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

  //console.log(testUserAuthToken);

  const getUserRes = await request(app)
    .get("/api/user/me")
    .send()
    .set("Authorization", `Bearer ${testUserAuthToken}`);
  expect(getUserRes.status).toBe(200);

  compareUsersButStripPassword(getUserRes.body, testUser);
});

test("only-update-own-user", async () => {
  testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

  //Update self
  testUser.name = "new pizza diner";

  const updateUserRes = await request(app)
    .put(`/api/user/${testUserId}`)
    .send(testUser)
    .set("Authorization", `Bearer ${testUserAuthToken}`);
  expect(updateUserRes.status).toBe(200);

  compareUsersButStripPassword(updateUserRes.body.user, testUser);
  expect(updateUserRes.body.user.name).toBe("new pizza diner");

  //Attempt to update another user
  const badUpdate = adminUser;
  badUpdate.name = "badName";

  const badUpdateUserRes = await request(app)
    .put(`/api/user/${adminUserId}`)
    .send(badUpdate)
    .set("Authorization", `Bearer ${testUserAuthToken}`);
  expect(badUpdateUserRes.status).toBe(403);
});

test("admin-update-any-user", async () => {
  adminToken = await loginUserIfNeeded(adminUser, null);

  //Update self
  adminUser.name = "theGreatAdmin";

  let updateUserRes = await request(app)
    .put(`/api/user/${adminUserId}`)
    .send(adminUser)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(updateUserRes.status).toBe(200);

  compareUsersButStripPassword(updateUserRes.body.user, adminUser);
  expect(updateUserRes.body.user.name).toBe("theGreatAdmin");

  //Update another user
  testUser.name = "New Pizza Diner!";

  updateUserRes = await request(app)
    .put(`/api/user/${testUserId}`)
    .send(testUser)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(updateUserRes.status).toBe(200);

  compareUsersButStripPassword(updateUserRes.body.user, testUser);
  expect(updateUserRes.body.user.name).toBe("New Pizza Diner!");
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

function compareUsersButStripPassword(userWithoutPassword, userWithPassword) {
  const { password: _password, ...user } = {
    ...userWithPassword,
    roles:
      userWithPassword.roles === undefined
        ? [{ role: "diner" }]
        : userWithPassword.roles,
  };
  expect(userWithoutPassword).toMatchObject(user);
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = "testAdmin";
  user.email = user.name + "@admin.com";

  await DB.addUser(user);
  user.password = "toomanysecrets";

  let { id } = await DB.getUser(user.email, user.password);

  return [user, id];
}
