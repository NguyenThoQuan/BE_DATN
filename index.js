import queryString from "query-string";
import jsonServer from "json-server";
import auth from "json-server-auth";
import bcrypt from "bcrypt";

const server = jsonServer.create();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();

// Set default middlewares (logger, static, cors and no-cache)
server.use(middlewares);

// Add custom routes before JSON Server router
server.get("/echo", (req, res) => {
  res.jsonp(req.query);
});

// To handle POST, PUT and PATCH you need to use a body-parser
// You can use the one used by JSON Server
server.use(jsonServer.bodyParser);

// Middleware to add createdAt for all POST requests and createById, createByName for /api/build
server.use((req, res, next) => {
  if (req.method === "POST") {
    req.body.createdAt = Date.now();

    if (req.path === "/api/build") {
      const userId = req.headers["x-user-id"]; // Lấy userId từ header
      if (!userId) {
        return res.status(400).jsonp({ error: "X-User-Id header is required" });
      }

      // Lấy database
      const db = router.db;
      const user = db
        .get("users")
        .find({ id: parseInt(userId) })
        .value();

      if (!user) {
        return res.status(404).jsonp({ error: "User not found" });
      }

      // Thêm createById và createByName vào body
      req.body.createById = user.id;
      req.body.createByName = user.fullName;
    }
  }
  // Continue to JSON Server router
  next();
});

// In this example, returned resources will be wrapped in a body property
router.render = (req, res) => {
  // Handle pagination
  const totalCountResponse = Number.parseInt(res.get("X-Total-Count"));
  console.log("totalCountResponse: ", totalCountResponse);

  if (req.method === "GET" && totalCountResponse) {
    const queryParams = queryString.parse(req._parsedUrl.query);
    console.log("queryParams: ", queryParams);

    const body = {
      data: res.locals.data,
      pagination: {
        _page: Number.parseInt(queryParams._page) || 1,
        _limit: Number.parseInt(queryParams._limit) || 10,
        _totalRows: totalCountResponse,
      },
    };

    return res.jsonp(body);
  }

  return res.jsonp(res.locals.data);
};

// Endpoint để đổi mật khẩu
server.put("/api/change-password", async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;

  // Kiểm tra các trường bắt buộc
  if (!email || !oldPassword || !newPassword) {
    return res.status(400).jsonp({
      error: "Email, current password, and new password are required",
    });
  }

  try {
    // Tìm người dùng trong db.json
    const db = router.db; // Lấy database
    const user = db.get("users").find({ email }).value();

    if (!user) {
      return res.status(404).jsonp({ error: "Tài khoản không tồn tại !" });
    }

    // So sánh mật khẩu hiện tại
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .jsonp({ error: "Mật khẩu hiện tại không chính xác !" });
    }

    // Mã hóa mật khẩu mới
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Cập nhật mật khẩu mới trong database
    db.get("users")
      .find({ email })
      .assign({ password: hashedNewPassword, updatedAt: Date.now() })
      .write();

    return res.jsonp({ message: "Đổi mật khẩu thành công !" });
  } catch (error) {
    console.error(error);
    return res.status(500).jsonp({ error: "Có lỗi xảy ra ở máy chủ !" });
  }
});

// Bind the router db to server
server.db = router.db;

// Apply the auth middleware
server.use(auth);

// Use default router
server.use("/api/", router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("JSON Server is running");
});
