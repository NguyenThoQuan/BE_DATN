import queryString from "query-string";
import jsonServer from "json-server";
import auth from "json-server-auth";

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
server.use((req, res, next) => {
  if (req.method === "POST") {
    req.body.createdAt = Date.now();
  }
  // Continue to JSON Server router
  next();
});

// In this example, returned resources will be wrapped in a body property
router.render = (req, res) => {
  //Handle pagination
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

//bind the router db to server
server.db = router.db;

//apply the auth middleware
server.use(auth);

// Use default router
server.use("/api/", router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("JSON Server is running");
});
