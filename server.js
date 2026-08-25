const http = require("http");
const fs = require("fs");
const querystring = require("querystring");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");
require("dotenv").config();

// =========================
// NODEMAILER
// =========================

const transporter = nodemailer.createTransport({

    service: "gmail",

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// =========================
// MONGODB
// =========================
const url = process.env.MONGO_URL;

const client = new MongoClient(url);
const sessions = new Map();
const flightDefaults = {
    Emirates: { from: "Delhi", to: "Dubai" },
    Qatar: { from: "Delhi", to: "Doha" },
    Singapore: { from: "Delhi", to: "Singapore" },
    KoreanAir: { from: "Delhi", to: "Seoul" },
    JapanAirlines: { from: "Delhi", to: "Tokyo" },
    BritishAirways: { from: "Delhi", to: "London" },
    Lufthansa: { from: "Delhi", to: "Frankfurt" },
    AirIndia: { from: "Delhi", to: "New York" },
    SwissAir: { from: "Delhi", to: "Zurich" },
    AirFrance: { from: "Delhi", to: "Paris" },
    MaldivianAir: { from: "Delhi", to: "Maldives" },
    BaliAir: { from: "Delhi", to: "Bali" },
    TurkishAirlines: { from: "Delhi", to: "Istanbul" },
    ThaiAirways: { from: "Delhi", to: "Bangkok" },
    Etihad: { from: "Delhi", to: "Abu Dhabi" },
    Thai: { from: "Mumbai", to: "Bangkok" },
    Turkish: { from: "Kolkata", to: "Istanbul" },
    Swiss: { from: "Mumbai", to: "Zurich" },
    GarudaIndonesia: { from: "Delhi", to: "Bali" }
};

function readCookies(req) {
    return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(cookie => {
        const separator = cookie.indexOf("=");
        return [cookie.slice(0, separator).trim(), decodeURIComponent(cookie.slice(separator + 1).trim())];
    }));
}

function setSession(res, user) {
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { email: user.email, fullname: user.fullname, role: user.role || "user" });
    res.setHeader("Set-Cookie", `skyline_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
}

function redirect(res, location) {
    res.writeHead(302, { Location: location });
    res.end();
}

function escapeHTML(value) {
    return String(value || "").replace(/[&<>\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function publicNavigation(session) {
    if (!session) return '<a href="/login">Sign in</a><a href="/signup" class="nav-join">Create account</a>';
    return `<a href="/dashboard" class="member-link">Hi, ${escapeHTML(session.fullname)}</a><a href="/logout" class="nav-join">Log out</a>`;
}

function clearSession(req, res) {
    const sessionCookie = readCookies(req).skyline_session;
    if (sessionCookie) sessions.delete(sessionCookie);
    res.setHeader("Set-Cookie", "skyline_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
    redirect(res, "/");
}

function loginPage(res, next, message = "") {
    fs.readFile("views/login.html", "utf8", (err, data) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data.replace("{{next}}", escapeHTML(next)).replace("{{loginMessage}}", escapeHTML(message)).replace("{{loginMessageClass}}", message ? "login-error" : ""));
    });
}

function loginSuccessLocation(location) {
    const target = new URL(location || "/dashboard", "http://localhost");
    target.searchParams.set("login", "success");
    return target.pathname + target.search;
}

async function startDB() {

    await client.connect();

    console.log("MongoDB Connected");
}

startDB();

// =========================
// FILE SERVER
// =========================

function serveFile(path, type, res) {

    fs.readFile(path, (err, data) => {

        if (err) {

            res.writeHead(404, {
                "Content-Type": "text/plain"
            });

            return res.end("File Not Found");
        }

        res.writeHead(200, {
            "Content-Type": type
        });

        res.end(data);
    });
}

// =========================
// SERVER
// =========================

const server = http.createServer((req, res) => {

    let body = "";

    req.on("data", chunk => {

        body += chunk.toString();
    });

    req.on("end", async () => {

        const db = client.db("airline");
        const session = sessions.get(readCookies(req).skyline_session);

        if (req.url.split("?")[0] === "/logout") return clearSession(req, res);

        if (["/admin", "/admin-users", "/admin-bookings"].includes(req.url.split("?")[0]) || req.url.startsWith("/delete-user")) {
            if (!session || session.role !== "admin") return redirect(res, "/admin-login");
        }

        if ((req.url.startsWith("/booking") || req.url === "/book") && !session) {
            return redirect(res, `/login?next=${encodeURIComponent(req.url)}`);
        }

        //DELETE


        if (req.url.startsWith("/delete-user")) {

            const email =
                decodeURIComponent(
                    req.url.split("=")[1]
                );

            await db.collection("users")
                .deleteOne({
                    email: email
                });

            res.writeHead(302, {
                Location: "/admin-users"
            });

            return res.end();
        }

        // =========================
        // ADMIN USERS
        // =========================

        if (req.url === "/admin-users") {

            const allUsers =
                await db.collection("users")
                    .find()
                    .toArray();

            let userRows = "";

            allUsers.forEach(user => {

                userRows += `

<tr>

<td>${user.fullname || "N/A"}</td>

<td>${user.email}</td>

<td>

<a
href="#"
class="delete-btn"
onclick="openDeleteModal('/delete-user?email=${user.email}')">

Delete

</a>

</td>

</tr>

`;
            });

            fs.readFile(
                "views/users.html",
                "utf8",
                (err, data) => {

                    let page = data
                        .replace(
                            "{{userRows}}",
                            userRows
                        );

                    res.writeHead(200, {
                        "Content-Type": "text/html"
                    });

                    res.end(page);
                }
            );

            return;
        }

        // =========================
        // ADMIN BOOKINGS
        // =========================

        if (req.url === "/admin-bookings") {

            const allBookings =
                await db.collection("bookings")
                    .find()
                    .toArray();

            let rows = "";

            allBookings.forEach(item => {

                rows += `

<tr>

<td>${item.fullname}</td>

<td>${item.from}</td>

<td>${item.to}</td>

<td>${item.airline || "N/A"}</td>

<td>₹${item.totalPrice || 0}</td>

</tr>

`;
            });

            fs.readFile(
                "views/bookings.html",
                "utf8",
                (err, data) => {

                    let page = data
                        .replace(
                            "{{rows}}",
                            rows
                        );

                    res.writeHead(200, {
                        "Content-Type": "text/html"
                    });

                    res.end(page);
                }
            );

            return;
        }

        // =========================
        // ADMIN DASHBOARD
        // =========================

        if (req.url === "/admin") {

            const users =
                await db.collection("users")
                    .countDocuments();

            const bookings =
                await db.collection("bookings")
                    .countDocuments();

            const allBookings =
                await db.collection("bookings")
                    .find()
                    .toArray();

            let totalRevenue = 0;

            allBookings.forEach(item => {

                totalRevenue +=
                    Number(item.totalPrice || 0);

            });

            let rows = "";

            allBookings.forEach((item, index) => {

                rows += `
<tr>

<td>${index + 1}</td>

<td>${item.fullname}</td>
<td>${item.from}</td>
<td>${item.to}</td>
<td>${item.airline || "N/A"}</td>
<td>₹${item.totalPrice || 0}</td>

</tr>
`;

            });

            fs.readFile(
                "views/admin.html",
                "utf8",
                (err, data) => {

                    let page = data

                        .replace("{{users}}", users)

                        .replace("{{bookings}}", bookings)

                        .replace("{{revenue}}", totalRevenue)

                        .replace("{{rows}}", rows);

                    res.writeHead(200, {
                        "Content-Type": "text/html"
                    });

                    res.end(page);
                }
            );

            return;
        }

        // =========================
        // GET REQUESTS
        // =========================

        if (req.method === "GET") {

            if (req.url.split("?")[0] === "/") {
                return fs.readFile("views/landing.html", "utf8", (err, data) => {
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(data.replace("{{authLinks}}", publicNavigation(session)));
                });
            }

            if (req.url === "/flights") {
                return serveFile("views/flights.html", "text/html", res);
            }

            if (req.url.startsWith("/login")) {
                if (session) return redirect(res, "/dashboard");
                const loginUrl = new URL(req.url, "http://localhost");
                const preservedBookingQuery = ["airline", "price", "from", "to", "depart", "return"].filter(key => loginUrl.searchParams.has(key)).map(key => `${key}=${encodeURIComponent(loginUrl.searchParams.get(key))}`).join("&");
                const selectedDefaults = flightDefaults[loginUrl.searchParams.get("airline")] || {};
                const next = loginUrl.searchParams.get("next") || (preservedBookingQuery ? `/booking?${preservedBookingQuery}` : (selectedDefaults.to ? `/booking?airline=${encodeURIComponent(loginUrl.searchParams.get("airline"))}&price=${encodeURIComponent(loginUrl.searchParams.get("price") || "")}&from=${encodeURIComponent(selectedDefaults.from)}&to=${encodeURIComponent(selectedDefaults.to)}&depart=2026-08-27` : ""));
                return loginPage(res, next);
            }

            if (req.url === "/signup") {
                if (session) return redirect(res, "/dashboard");
                return serveFile("views/signup.html", "text/html", res);
            }

            if (req.url.split("?")[0] === "/dashboard" || req.url.split("?")[0] === "/search") {
                return fs.readFile("views/search.html", "utf8", (err, data) => {
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(data.replace("{{authLinks}}", publicNavigation(session)));
                });
            }

            if (req.url === "/admin.png") {
                return serveFile("admin.png", "image/png", res);
            }

            if (req.url.startsWith("/booking")) {
                return fs.readFile("views/index.html", "utf8", (err, data) => {
                    const bookingUrl = new URL(req.url, "http://localhost");
                    const selectedDefaults = flightDefaults[bookingUrl.searchParams.get("airline")] || { from: "Delhi", to: "Dubai" };
                    const origin = bookingUrl.searchParams.get("from") || selectedDefaults.from;
                    const destination = bookingUrl.searchParams.get("to") || selectedDefaults.to;
                    const departure = bookingUrl.searchParams.get("depart") || "2026-08-27";
                    const bookingPage = data
                        .replace(/\{\{fullname\}\}/g, session ? session.fullname : "")
                        .replace(/\{\{email\}\}/g, session ? session.email : "")
                        .replace(/\{\{airline\}\}/g, bookingUrl.searchParams.get("airline") || "")
                        .replace(/\{\{price\}\}/g, bookingUrl.searchParams.get("price") || "")
                        .replace(/\{\{from\}\}/g, origin)
                        .replace(/\{\{to\}\}/g, destination)
                        .replace(/\{\{depart\}\}/g, departure);
                    const completedPage = bookingPage
                        .replace(/name="from"([^>]*value=")([^"]*)/g, `name="from"$1${origin}`)
                        .replace(/name="to"([^>]*value=")([^"]*)/g, `name="to"$1${destination}`)
                        .replace(/name="depart"([^>]*value=")([^"]*)/g, `name="depart"$1${departure}`);
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(completedPage);
                });
            }

            if (req.url === "/admin-login") {
                return serveFile("views/admin-login.html", "text/html", res);
            }

            if (req.url === "/premium") {
                return serveFile("views/premium.html", "text/html", res);
            }

            if (req.url === "/destinations") {
                return serveFile("views/destinations.html", "text/html", res);
            }

            // CSS
            if (req.url === "/premium.css") return serveFile("premium.css", "text/css", res);
            if (req.url === "/destinations.css") return serveFile("destinations.css", "text/css", res);
            if (req.url === "/destination-detail.css") return serveFile("destination-detail.css", "text/css", res);
            if (req.url === "/landing.css") return serveFile("landing.css", "text/css", res);
            if (req.url === "/style.css") return serveFile("style.css", "text/css", res);
            if (req.url === "/search.css") return serveFile("search.css", "text/css", res);
            if (req.url === "/admin.css") return serveFile("admin.css", "text/css", res);
            if (req.url === "/success.css") return serveFile("success.css", "text/css", res);
            if (req.url === "/booking.css") return serveFile("booking.css", "text/css", res);
            if (req.url === "/ticket.css") return serveFile("ticket.css", "text/css", res);

            // IMAGES
            if (req.url === "/flight.jpg") return serveFile("flight.jpg", "image/jpeg", res);
            if (req.url === "/air.jpg") return serveFile("air.jpg", "image/jpeg", res);

            // DESTINATIONS
            if (req.url === "/south-korea") return serveFile("views/south-korea.html", "text/html", res);
            if (req.url === "/london") return serveFile("views/london.html", "text/html", res);
            if (req.url === "/switzerland") return serveFile("views/switzerland.html", "text/html", res);
            if (req.url === "/paris") return serveFile("views/paris.html", "text/html", res);
            if (req.url === "/dubai") return serveFile("views/dubai.html", "text/html", res);
            if (req.url === "/singapore") return serveFile("views/singapore.html", "text/html", res);
            if (req.url === "/maldives") return serveFile("views/maldives.html", "text/html", res);
            if (req.url === "/bali") return serveFile("views/bali.html", "text/html", res);
            if (req.url === "/japan") return serveFile("views/japan.html", "text/html", res);
            if (req.url === "/new-york") return serveFile("views/new-york.html", "text/html", res);

            return res.end("Page Not Found");
        }

        // =========================
        // POST REQUESTS
        // =========================

        if (req.method === "POST") {

            const formData =
                querystring.parse(body);
            if (req.url === "/admin-login") {

                if (
                    formData.username === "admin"
                    &&
                    formData.password === process.env.ADMIN_PASSWORD
                ) {
                    setSession(res, { email: "admin", fullname: "Administrator", role: "admin" });
                    return redirect(res, "/admin");
                }

                res.writeHead(200, {
                    "Content-Type": "text/html"
                });

                return res.end(`

    <h1 style="
    color:red;
    text-align:center;
    margin-top:100px;
    font-family:Arial;
    ">

    Invalid Admin Login

    </h1>

    `);
            }

            // =========================
            // SIGNUP
            // =========================

            if (req.url === "/signup") {

                const existingUser = await db.collection("users").findOne({ email: formData.email });
                if (existingUser) {
                    return fs.readFile("views/signup.html", "utf8", (err, data) => {
                        res.writeHead(200, { "Content-Type": "text/html" });
                        res.end(data.replace("{{signupMessage}}", "Account already exists. Please sign in.").replace("{{signupMessageClass}}", "signup-error"));
                    });
                }

                await db.collection("users")
                    .insertOne(formData);
                setSession(res, formData);
                return redirect(res, loginSuccessLocation("/dashboard"));
            }

            // =========================
            // LOGIN
            // =========================

            if (req.url === "/login") {

                const user = await db.collection("users")
                    .findOne({

                        email: formData.email,

                        password: formData.password
                    });

                if (!user) {
                    return loginPage(res, formData.next || "", "Incorrect email or password. Please try again.");
                }

                setSession(res, user);
                const next = formData.next && String(formData.next).startsWith("/") ? formData.next : "/dashboard";
                return redirect(res, loginSuccessLocation(next));
            }

            // =========================
            // BOOKING
            // =========================

            if (req.url === "/book") {

                if (!session) return redirect(res, "/login");

                formData.fullname = session.fullname;
                formData.email = session.email;

                const rows = [
                    "A",
                    "B",
                    "C",
                    "D",
                    "E",
                    "F"
                ];

                const seatNumber =
                    rows[Math.floor(Math.random() * rows.length)] +
                    (Math.floor(Math.random() * 30) + 1);

                const boardingTime =
                    `${Math.floor(Math.random() * 12) + 1}:${String(
                        Math.floor(Math.random() * 60)
                    ).padStart(2, "0")} AM`;

                const ticketNumber =
                    "TKT" +
                    Math.floor(Math.random() * 1000000);

                const basePrice =
                    Number(formData.price);

                const passengers =
                    Math.max(1, Number(formData.adult || 0) + Number(formData.child || 0));

                const totalPrice =
                    basePrice * passengers;

                formData.totalPrice =
                    totalPrice;

                formData.seatNumber =
                    seatNumber;

                formData.boardingTime =
                    boardingTime;

                formData.ticketNumber =
                    ticketNumber;

                console.log("Booking Data:", formData);

                await db.collection("bookings")
                    .insertOne(formData);

                console.log("Booking Saved");

                const mailOptions = {

                    from:
                        "meghakundumeghakundu@gmail.com",

                    to:
                        formData.email,

                    subject:
                        "Flight Ticket Confirmed ✈️",

                    html: `

<h1>Skyline Airways ✈️</h1>

<h2>Your Booking is Confirmed</h2>

<p>
Passenger:
${formData.fullname}
</p>

<p>
Route:
${formData.from} → ${formData.to}
</p>

<p>
Seat Number:
${formData.seatNumber}
</p>

<p>
Boarding Time:
${formData.boardingTime}
</p>

<p>
Ticket Price:
₹${formData.totalPrice}
</p>

`
                };

                transporter.sendMail(
                    mailOptions,
                    (error, info) => {

                        if (error) {

                            console.log(error);

                        } else {

                            console.log(
                                "Email Sent Successfully"
                            );
                        }
                    });

                fs.readFile(
                    "views/success.html",
                    "utf8",
                    (err, data) => {

                        let page = data

                            .replace(
                                "{{fullname}}",
                                formData.fullname
                            )

                            .replace(
                                "{{from}}",
                                formData.from
                            )

                            .replace(
                                "{{to}}",
                                formData.to
                            )

                            .replace(
                                "{{depart}}",
                                formData.depart
                            )

                            .replace(
                                "{{travelClass}}",
                                formData.travelClass
                            )

                            .replace(
                                "{{seatNumber}}",
                                formData.seatNumber
                            )

                            .replace(
                                "{{boardingTime}}",
                                formData.boardingTime
                            )

                            .replace(
                                "{{price}}",
                                formData.totalPrice
                            )

                            .replace(
                                "{{ticketNumber}}",
                                formData.ticketNumber
                            )

                            .replace(
                                "{{email}}",
                                formData.email
                            );

                        res.writeHead(200, {
                            "Content-Type": "text/html"
                        });

                        res.end(page);
                    }
                );
            }
        }
    });
});

// =========================
// SERVER PORT
// =========================

const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port", PORT);
});