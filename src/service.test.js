const request = require("supertest");
const app = require("./service");
const { Role, DB } = require("./database/database.js");

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let testUserId;

let adminUser;
let adminUserId;
let adminToken;

const testFranchisee = {
  name: "pizza franchisee",
  email: "reg@test.com",
  password: "b",
};
let testFranchiseeAuthToken;
let testFranchiseeId;
const testFranchise = {
  name: "myNewFranchise",
};
let testFranchiseId;

const testStore = { franchiseId: -1, name: "SF" };
let testStoreId;

const testMenuItem = {
  title: "Echidna's Tea",
  description: "It may or may not contain body fluids",
  image: "tea.png",
  price: 10,
};

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  testUserId = registerRes.body.user.id;

  [adminUser, adminUserId] = await createAdminUser();

  adminToken = await loginUserIfNeeded(adminUser, adminToken);

  testFranchisee.email =
    Math.random().toString(36).substring(2, 12) + "@test.com";
  const registereeRes = await request(app)
    .post("/api/auth")
    .send(testFranchisee);
  testFranchiseeAuthToken = registereeRes.body.token;
  testFranchiseeId = registereeRes.body.user.id;

  testFranchise.name =
    "Franchise_" + Math.random().toString(36).substring(2, 12);
  testFranchise.admins = [{ email: testFranchisee.email }];
  const createdFranchiseRes = await request(app)
    .post("/api/franchise")
    .send(testFranchise)
    .set("Authorization", `Bearer ${adminToken}`);
  testFranchiseId = createdFranchiseRes.body.id;
});

afterAll(async () => {
  await request(app)
    .delete(`/api/franchise/${testFranchiseId}`)
    .set("Authorization", `Bearer ${adminToken}`);
});

test("default-endpoint", async () => {
  const defaultRes = await request(app).get("/");
  expect(defaultRes.status).toBe(200);
  expect(defaultRes.body.message).toBe("welcome to JWT Pizza");
  expect(defaultRes.body).toHaveProperty("version");
});

test("unknown-endpoint", async () => {
  const notFoundRes = await request(app).post("/trash");
  expect(notFoundRes.status).toBe(404);
  expect(notFoundRes.body.message).toBe("unknown endpoint");
});

describe("authRouter", () => {
  test("login", async () => {
    const loginRes = await request(app).put("/api/auth").send(testUser);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toMatch(
      /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
    );

    compareUsersButStripPassword(loginRes.body.user, testUser);
  });

  test("bad-login", async () => {
    const badUser = { ...testUser };
    badUser.password = "BadPassword";
    const badLoginRes = await request(app).put("/api/auth").send(badUser);
    expect(badLoginRes.status).toBe(404);
  });

  test("logout", async () => {
    testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

    await request(app)
      .delete("/api/auth")
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .expect(200);

    testUserAuthToken = null;
  });
});

describe("franchiseRouter", () => {
  test("create-store", async () => {
    testStore.franchiseId = testFranchiseId;
    const createdStoreRes = await request(app)
      .post(`/api/franchise/${testFranchiseId}/store`)
      .send(testStore)
      .set("Authorization", `Bearer ${testFranchiseeAuthToken}`);
    expect(createdStoreRes.status).toBe(200);
    expect(createdStoreRes.body).toMatchObject(testStore);

    testStoreId = createdStoreRes.body.id;
  });

  test("delete-store", async () => {
    testStoreId = await createStoreIfNeeded(
      testFranchiseId,
      testFranchiseeAuthToken,
      testStore,
      testStoreId
    );
    await request(app)
      .delete(`/api/franchise/${testFranchiseId}/store/${testStoreId}`)
      .send(testStore)
      .set("Authorization", `Bearer ${testFranchiseeAuthToken}`)
      .expect(200);
  });

  test("get-franchises", async () => {
    const getFranchisesRes = await request(app)
      .get("/api/franchise")
      .expect(200);
    const listOfFranchises = getFranchisesRes.body.franchises;
    //console.log(listOfFranchises);
    expect(listOfFranchises.length).toBeGreaterThan(0);
  });

  test("get-user-franchises", async () => {
    const getFranchisesRes = await request(app)
      .get(`/api/franchise/${testFranchiseeId}`)
      .set("Authorization", `Bearer ${testFranchiseeAuthToken}`)
      .expect(200);
    const listOfFranchises = getFranchisesRes.body;
    //console.log(listOfFranchises);
    expect(listOfFranchises.length).toBeGreaterThan(0);
  });

  test("forbidden-requests", async () => {
    testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

    //Creating a franchise
    await request(app)
      .post("/api/franchise")
      .send(testFranchise)
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .expect(403);

    //Creating a store
    await request(app)
      .post(`/api/franchise/${testFranchiseId}/store`)
      .send(testStore)
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .expect(403);

    //Deleting a store
    await request(app)
      .delete(`/api/franchise/${testFranchiseId}/store/${testStoreId}`)
      .send(testStore)
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .expect(403);
  });
});

describe("orderRouter", () => {
  test("get-menu", async () => {
    const getMenuRes = await request(app).get("/api/order/menu");
    expect(getMenuRes.status).toBe(200);
  });

  test("add-menu-item", async () => {
    adminToken = await loginUserIfNeeded(adminUser, adminToken);

    const addMenuItemRes = await request(app)
      .put("/api/order/menu")
      .send(testMenuItem)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(addMenuItemRes.status).toBe(200);
    //console.log(addMenuItemRes.body);
    expect(addMenuItemRes.body).toEqual(
      expect.arrayContaining([expect.objectContaining(testMenuItem)])
    );
  });

  test("create-order", async () => {
    testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);
    testStoreId = await createStoreIfNeeded(
      testFranchiseId,
      testFranchiseeAuthToken,
      testStore,
      testStoreId
    );

    const order = {
      franchiseId: testFranchiseId,
      storeId: testStoreId,
      items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
    };

    const createOrderRes = await request(app)
      .post("/api/order")
      .send(order)
      .set("Authorization", `Bearer ${testUserAuthToken}`);
    expect(createOrderRes.status).toBe(200);
    expect(createOrderRes.body.order).toMatchObject(order);
    expect(createOrderRes.body.jwt).toMatch(
      /^[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+$/
    );
  });

  test("get-orders", async () => {
    testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

    const getOrdersRes = await request(app)
      .get("/api/order")
      .set("Authorization", `Bearer ${testUserAuthToken}`);
    expect(getOrdersRes.status).toBe(200);
    expect(getOrdersRes.body).toHaveProperty("dinerId");
    expect(getOrdersRes.body).toHaveProperty("orders");
  });
});

describe("userRouter", () => {
  test("get-user", async () => {
    //console.log(testUserAuthToken);

    testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

    //console.log(testUserAuthToken);

    const getUserRes = await request(app)
      .get("/api/user/me")
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
    adminToken = await loginUserIfNeeded(adminUser, adminToken);

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
});

test("list-users-unauthorized", async () => {
  const listUsersRes = await request(app).get("/api/user");
  expect(listUsersRes.status).toBe(401);
});

test("list-users", async () => {
  testUserAuthToken = await loginUserIfNeeded(testUser, testUserAuthToken);

  const listUsersRes = await request(app)
    .get("/api/user")
    .set("Authorization", `Bearer ${testUserAuthToken}`);
  expect(listUsersRes.status).toBe(200);
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

async function createStoreIfNeeded(
  franchiseId,
  franchiseeAuthToken,
  store,
  storeId
) {
  if (storeId == null) {
    await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .send(store)
      .set("Authorization", `Bearer ${franchiseeAuthToken}`);
  }
  return storeId;
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
