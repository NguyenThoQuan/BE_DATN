import queryString from "query-string";
import jsonServer from "json-server";
import auth from "json-server-auth";
import bcrypt from "bcrypt";

const server = jsonServer.create();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();

server.use(middlewares);

server.get("/echo", (req, res) => {
  res.jsonp(req.query);
});

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

// Endpoint để lấy build theo collab.id
server.get("/api/build/collab/:collabId", (req, res) => {
  try {
    const collabId = parseInt(req.params.collabId); // Lấy collabId từ params
    if (isNaN(collabId)) {
      return res.status(400).jsonp({ error: "collabId must be a number" });
    }

    const db = router.db; // Lấy database
    const builds = db.get("build").value(); // Lấy tất cả bản ghi build

    // Lấy query params
    const queryParams = queryString.parse(req._parsedUrl.query);
    const keySearch = queryParams.keySearch
      ? queryParams.keySearch.toLowerCase()
      : null;
    const page = Number.parseInt(queryParams._page) || 1;
    const limit = Number.parseInt(queryParams._limit) || 10;

    // Lọc các bản ghi build
    const filteredBuilds = builds.filter((build) => {
      // Kiểm tra mode là "user"
      const isModeUser = build.mode === "user" || "edit";

      // Kiểm tra collab.id
      const hasCollabId =
        build.collab && build.collab.some((collab) => collab.id === collabId);

      // Kiểm tra keySearch (nếu có)
      const matchesKeySearch = keySearch
        ? build.name.toLowerCase().includes(keySearch)
        : true;

      // Trả về true nếu tất cả điều kiện đều thỏa mãn
      return isModeUser && hasCollabId && matchesKeySearch;
    });

    // Xử lý phân trang
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedBuilds = filteredBuilds.slice(startIndex, endIndex);

    // Trả về kết quả với status 200, kể cả khi filteredBuilds rỗng
    res.status(200).jsonp({
      data: paginatedBuilds,
      pagination: {
        _page: page,
        _limit: limit,
        _totalRows: filteredBuilds.length,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).jsonp({ error: "Server error" });
  }
});

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
