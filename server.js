const http = require("http");
const fs = require("fs");
const querystring = require("querystring");
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

        const db = client.db("asp");

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

            if (req.url === "/") {
                return serveFile("views/landing.html", "text/html", res);
            }

            if (req.url === "/flights") {
                return serveFile("views/flights.html", "text/html", res);
            }

            if (req.url === "/login") {
                return serveFile("views/login.html", "text/html", res);
            }

            if (req.url === "/signup") {
                return serveFile("views/signup.html", "text/html", res);
            }

            if (req.url === "/dashboard") {
                return serveFile("views/search.html", "text/html", res);
            }

            if (req.url === "/admin.png") {
                return serveFile("admin.png", "image/png", res);
            }

            if (req.url.startsWith("/booking")) {
                return serveFile("views/index.html", "text/html", res);
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
            if (req.url === "/landing.css") return serveFile("landing.css", "text/css", res);
            if (req.url === "/style.css") return serveFile("style.css", "text/css", res);
            if (req.url === "/search.css") return serveFile("search.css", "text/css", res);
            if (req.url === "/admin.css") return serveFile("admin.css", "text/css", res);
            if (req.url === "/success.css") return serveFile("success.css", "text/css", res);

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
                    formData.password === "12345"
                ) {

                    res.writeHead(302, {
                        Location: "/admin"
                    });

                    return res.end();
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

                await db.collection("users")
                    .insertOne(formData);

                res.writeHead(302, {
                    Location: "/login"
                });

                return res.end();
            }

            // =========================
            // LOGIN
            // =========================

            if (req.url === "/login") {

                console.log(formData);

                const user = await db.collection("users")
                    .findOne({

                        email: formData.email,

                        password: formData.password
                    });

                console.log(user);

                if (!user) {

                    res.writeHead(200, {
                        "Content-Type": "text/html"
                    });

                    return res.end(`
            <h1 style="color:red;text-align:center;margin-top:100px;">
                Invalid Login
            </h1>
        `);
                }

                fs.readFile(
                    "views/login-success.html",
                    "utf8",
                    (err, data) => {

                        let page = data.replace(
                            "{{fullname}}",
                            user.fullname
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
            // BOOKING
            // =========================

            if (req.url === "/book") {

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
                    Number(formData.adult || 1);

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

server.listen(8080, () => {

    console.log(
        "Server running on http://localhost:8080"
    );
});