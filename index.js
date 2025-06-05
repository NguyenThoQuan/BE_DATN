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

// Modified endpoint to add dataTable to a specific build
server.post("/api/build/:buildId/dataTable", (req, res) => {
  try {
    const buildId = parseInt(req.params.buildId);
    if (isNaN(buildId)) {
      return res.status(400).jsonp({ error: "buildId must be a number" });
    }

    const db = router.db;
    const build = db.get("build").find({ id: buildId }).value();

    if (!build) {
      return res.status(404).jsonp({ error: "Build not found" });
    }

    // Lấy dữ liệu từ body
    const fields = req.body;
    if (!fields || Object.keys(fields).length === 0) {
      return res.status(400).jsonp({ error: "Fields are required" });
    }

    // Tạo ID mới cho bản ghi dataTable
    const dataTableArray = build.dataTable || [];
    const newId =
      dataTableArray.length > 0
        ? Math.max(...dataTableArray.map((item) => item.id)) + 1
        : 1;

    // Tạo bản ghi mới cho dataTable
    const newDataTable = {
      id: newId,
      ...fields,
      createdAt: Date.now(),
    };

    // Cập nhật dataTable trong build
    const updatedDataTable = [newDataTable, ...dataTableArray];
    db.get("build")
      .find({ id: buildId })
      .assign({ dataTable: updatedDataTable })
      .write();

    // Tạo hoặc cập nhật bảng dataTableX (e.g., dataTable1 cho buildId = 1)
    const tableName = `dataTable${buildId}`;
    const existingTable = db.get(tableName).value();

    if (!existingTable) {
      // Nếu bảng chưa tồn tại, khởi tạo với dữ liệu từ dataTable của build
      db.set(tableName, updatedDataTable).write();
    } else {
      // Nếu bảng đã tồn tại, cập nhật dữ liệu để đồng bộ với dataTable của build
      db.set(tableName, updatedDataTable).write();
    }

    return res.status(200).jsonp({
      message: "DataTable added successfully and synced to new table",
      data: newDataTable,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).jsonp({ error: "Server error" });
  }
});

// New endpoint to delete dataTable entry from a specific build
server.delete("/api/build/:buildId/dataTable/:dataTableId", (req, res) => {
  try {
    const buildId = parseInt(req.params.buildId);
    const dataTableId = parseInt(req.params.dataTableId);

    if (isNaN(buildId) || isNaN(dataTableId)) {
      return res
        .status(400)
        .jsonp({ error: "buildId and dataTableId must be numbers" });
    }

    const db = router.db;
    const build = db.get("build").find({ id: buildId }).value();

    if (!build) {
      return res.status(404).jsonp({ error: "Build not found" });
    }

    const dataTableArray = build.dataTable || [];
    const dataTableIndex = dataTableArray.findIndex(
      (item) => item.id === dataTableId
    );

    if (dataTableIndex === -1) {
      return res.status(404).jsonp({ error: "DataTable entry not found" });
    }

    // Remove the dataTable entry
    const updatedDataTable = [
      ...dataTableArray.slice(0, dataTableIndex),
      ...dataTableArray.slice(dataTableIndex + 1),
    ];

    // Update dataTable in build
    db.get("build")
      .find({ id: buildId })
      .assign({ dataTable: updatedDataTable })
      .write();

    // Update the corresponding dataTableX table
    const tableName = `dataTable${buildId}`;
    const existingTable = db.get(tableName).value();

    if (existingTable) {
      db.set(tableName, updatedDataTable).write();
    }

    return res.status(200).jsonp({
      message: "DataTable entry deleted successfully",
      data: { id: dataTableId },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).jsonp({ error: "Server error" });
  }
});

// Endpoint để cập nhật dataTable entry trong dataTable${buildId} và đồng bộ với dataTable trong build
server.put("/api/build/:buildId/dataTable/:dataTableId", (req, res) => {
  try {
    const buildId = parseInt(req.params.buildId);
    const dataTableId = parseInt(req.params.dataTableId);

    if (isNaN(buildId) || isNaN(dataTableId)) {
      return res
        .status(400)
        .jsonp({ error: "buildId and dataTableId must be numbers" });
    }

    const db = router.db;
    const build = db.get("build").find({ id: buildId }).value();

    if (!build) {
      return res.status(404).jsonp({ error: "Build not found" });
    }

    const tableName = `dataTable${buildId}`;
    const existingTable = db.get(tableName).value();

    if (!existingTable) {
      return res.status(404).jsonp({ error: `Table ${tableName} not found` });
    }

    const dataTableArray = build.dataTable || [];
    const dataTableIndex = dataTableArray.findIndex(
      (item) => item.id === dataTableId
    );

    if (dataTableIndex === -1) {
      return res.status(404).jsonp({ error: "DataTable entry not found" });
    }

    // Lấy dữ liệu từ body
    const updatedFields = req.body;
    if (!updatedFields || Object.keys(updatedFields).length === 0) {
      return res.status(400).jsonp({ error: "Fields are required" });
    }

    // Tạo bản ghi mới với các trường được cập nhật
    const updatedDataTableEntry = {
      ...dataTableArray[dataTableIndex],
      ...updatedFields,
      updatedAt: Date.now(),
    };

    // Cập nhật dataTable trong build
    const updatedDataTable = [
      ...dataTableArray.slice(0, dataTableIndex),
      updatedDataTableEntry,
      ...dataTableArray.slice(dataTableIndex + 1),
    ];

    db.get("build")
      .find({ id: buildId })
      .assign({ dataTable: updatedDataTable })
      .write();

    // Cập nhật bảng dataTable${buildId}
    const tableData = db.get(tableName).value();
    const tableIndex = tableData.findIndex((item) => item.id === dataTableId);

    if (tableIndex === -1) {
      return res
        .status(404)
        .jsonp({ error: `DataTable entry not found in ${tableName}` });
    }

    const updatedTableData = [
      ...tableData.slice(0, tableIndex),
      updatedDataTableEntry,
      ...tableData.slice(tableIndex + 1),
    ];

    db.set(tableName, updatedTableData).write();

    return res.status(200).jsonp({
      message: "DataTable entry updated successfully and synced",
      data: updatedDataTableEntry,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).jsonp({ error: "Server error" });
  }
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

server.get("/api/build/staff/:staffId", (req, res) => {
  try {
    const staffId = parseInt(req.params.staffId); // Lấy staffId từ params
    if (isNaN(staffId)) {
      return res.status(400).jsonp({ error: "staffId must be a number" });
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
      // Kiểm tra mode là "user" hoặc "edit"
      const isModeValid = build.mode === "user" || build.mode === "edit";

      // Kiểm tra staff.id
      const hasStaffId =
        build.staff && build.staff.some((staff) => staff.id === staffId);

      // Kiểm tra keySearch (nếu có)
      const matchesKeySearch = keySearch
        ? build.name.toLowerCase().includes(keySearch)
        : true;

      // Trả về true nếu tất cả điều kiện đều thỏa mãn
      return isModeValid && hasStaffId && matchesKeySearch;
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
