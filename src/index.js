const PBKDF2_ITERATIONS = 100000;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 16;

const SESSION_DAYS = 30;


// ============================================================
// HELPERS
// ============================================================

function json(data, status = 200, corsHeaders) {
    return Response.json(data, {
        status,
        headers: corsHeaders
    });
}


function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}


function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(
            hex.substring(i * 2, i * 2 + 2),
            16
        );
    }

    return bytes;
}


function constantTimeEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;

    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }

    return result === 0;
}


async function hashPassword(password, salt) {
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        {
            name: "PBKDF2"
        },
        false,
        ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        passwordKey,
        256
    );

    return new Uint8Array(derivedBits);
}


async function hashToken(token) {
    const data = new TextEncoder().encode(token);

    const hash = await crypto.subtle.digest(
        "SHA-256",
        data
    );

    return bytesToHex(new Uint8Array(hash));
}


async function createSession(env, playerId) {
    // Generate a cryptographically secure random token.
    const tokenBytes = crypto.getRandomValues(
        new Uint8Array(32)
    );

    const token = bytesToHex(tokenBytes);

    // Never store the actual session token in the database.
    const tokenHash = await hashToken(token);

    const expiresAt = new Date(
        Date.now() +
        SESSION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sessions`,
        {
            method: "POST",

            headers: {
                "apikey": env.SUPABASE_SECRET_KEY,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                player_id: playerId,
                token_hash: tokenHash,
                expires_at: expiresAt
            })
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `Failed to create session: ${errorText}`
        );
    }

    return {
        token,
        expiresAt
    };
}


async function getSession(request, env) {
    const authorization =
        request.headers.get("Authorization");

    if (!authorization) {
        return null;
    }

    if (!authorization.startsWith("Bearer ")) {
        return null;
    }

    const token =
        authorization.substring(7).trim();

    if (!token) {
        return null;
    }

    const tokenHash = await hashToken(token);

    const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sessions?select=id,player_id,expires_at&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`,
        {
            method: "GET",

            headers: {
                "apikey": env.SUPABASE_SECRET_KEY
            }
        }
    );

    if (!response.ok) {
        return null;
    }

    const sessions = await response.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
        return null;
    }

    const session = sessions[0];

    if (
        new Date(session.expires_at).getTime() <=
        Date.now()
    ) {
        return null;
    }

    return {
        ...session,
        token,
        tokenHash
    };
}


// ============================================================
// MAIN WORKER
// ============================================================

export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods":
                "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization"
        };


        // ====================================================
        // CORS
        // ====================================================

        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders
            });
        }


        // ====================================================
        // API STATUS
        // ====================================================

        if (url.pathname === "/api/status") {

            return json(
                {
                    success: true,
                    service: "Lostera API",
                    status: "online",
                    version: "1.1.0"
                },
                200,
                corsHeaders
            );
        }


        // ====================================================
        // DATABASE TEST
        // ====================================================

        if (url.pathname === "/api/db-test") {

            if (
                !env.SUPABASE_URL ||
                !env.SUPABASE_SECRET_KEY
            ) {
                return json(
                    {
                        success: false,
                        error:
                            "Supabase environment variables are missing"
                    },
                    500,
                    corsHeaders
                );
            }

            try {

                const response = await fetch(
                    `${env.SUPABASE_URL}/rest/v1/players?select=id&limit=1`,
                    {
                        method: "GET",

                        headers: {
                            "apikey":
                                env.SUPABASE_SECRET_KEY
                        }
                    }
                );

                const responseText =
                    await response.text();

                if (!response.ok) {
                    return json(
                        {
                            success: false,
                            error:
                                "Database request failed",
                            status: response.status,
                            details: responseText
                        },
                        500,
                        corsHeaders
                    );
                }

                const players =
                    JSON.parse(responseText);

                return json(
                    {
                        success: true,
                        database: "connected",
                        table: "players",
                        playersFound:
                            players.length
                    },
                    200,
                    corsHeaders
                );

            } catch (error) {

                return json(
                    {
                        success: false,
                        error:
                            "Database connection error",
                        details: error.message
                    },
                    500,
                    corsHeaders
                );
            }
        }


        // ====================================================
        // REGISTER
        // ====================================================

        if (
            url.pathname ===
            "/api/auth/register"
        ) {

            if (request.method !== "POST") {
                return json(
                    {
                        success: false,
                        error:
                            "Method not allowed. Use POST."
                    },
                    405,
                    corsHeaders
                );
            }

            try {

                let body;

                try {
                    body = await request.json();
                } catch {
                    return json(
                        {
                            success: false,
                            error:
                                "Request body must be valid JSON"
                        },
                        400,
                        corsHeaders
                    );
                }

                const username = body.username;
                const password = body.password;

                if (
                    typeof username !== "string" ||
                    typeof password !== "string"
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Username and password are required"
                        },
                        400,
                        corsHeaders
                    );
                }


                // Username whitespace
                if (
                    username !== username.trim()
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Username cannot begin or end with spaces"
                        },
                        400,
                        corsHeaders
                    );
                }


                // Username length
                if (
                    username.length <
                        USERNAME_MIN_LENGTH ||
                    username.length >
                        USERNAME_MAX_LENGTH
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`
                        },
                        400,
                        corsHeaders
                    );
                }


                // Username characters
                if (
                    !/^[A-Za-z0-9_]+$/.test(
                        username
                    )
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Username can only contain letters, numbers, and underscores"
                        },
                        400,
                        corsHeaders
                    );
                }


                // Password length
                if (
                    password.length <
                        PASSWORD_MIN_LENGTH ||
                    password.length >
                        PASSWORD_MAX_LENGTH
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
                        },
                        400,
                        corsHeaders
                    );
                }


                // Check username
                const usernameCheck =
                    await fetch(
                        `${env.SUPABASE_URL}/rest/v1/players?select=id&username=eq.${encodeURIComponent(username)}&limit=1`,
                        {
                            headers: {
                                "apikey":
                                    env.SUPABASE_SECRET_KEY
                            }
                        }
                    );

                if (!usernameCheck.ok) {
                    return json(
                        {
                            success: false,
                            error:
                                "Failed to check username"
                        },
                        500,
                        corsHeaders
                    );
                }

                const existingPlayers =
                    await usernameCheck.json();

                if (
                    existingPlayers.length > 0
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Username is already taken"
                        },
                        409,
                        corsHeaders
                    );
                }


                // Generate salt
                const salt =
                    crypto.getRandomValues(
                        new Uint8Array(16)
                    );


                // Hash password
                const passwordHash =
                    await hashPassword(
                        password,
                        salt
                    );


                const storedPasswordHash =
                    `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(passwordHash)}`;


                // Create player
                const createResponse =
                    await fetch(
                        `${env.SUPABASE_URL}/rest/v1/players`,
                        {
                            method: "POST",

                            headers: {
                                "apikey":
                                    env.SUPABASE_SECRET_KEY,
                                "Content-Type":
                                    "application/json",
                                "Prefer":
                                    "return=representation"
                            },

                            body: JSON.stringify({
                                username:
                                    username,
                                password_hash:
                                    storedPasswordHash
                            })
                        }
                    );

                const createText =
                    await createResponse.text();

                if (!createResponse.ok) {

                    if (
                        createResponse.status ===
                        409
                    ) {
                        return json(
                            {
                                success: false,
                                error:
                                    "Username is already taken"
                            },
                            409,
                            corsHeaders
                        );
                    }

                    return json(
                        {
                            success: false,
                            error:
                                "Failed to create account",
                            details:
                                createText
                        },
                        500,
                        corsHeaders
                    );
                }

                const created =
                    JSON.parse(createText);

                const player = created[0];


                // Automatically create a session
                // after registration.
                const session =
                    await createSession(
                        env,
                        player.id
                    );


                return json(
                    {
                        success: true,
                        message:
                            "Account created successfully",

                        player: {
                            id: player.id,
                            username:
                                player.username,
                            created_at:
                                player.created_at
                        },

                        session: {
                            token:
                                session.token,
                            expires_at:
                                session.expiresAt
                        }
                    },
                    201,
                    corsHeaders
                );

            } catch (error) {

                return json(
                    {
                        success: false,
                        error:
                            "Registration failed",
                        details:
                            error.message
                    },
                    500,
                    corsHeaders
                );
            }
        }


        // ====================================================
        // LOGIN
        // ====================================================

        if (
            url.pathname ===
            "/api/auth/login"
        ) {

            if (request.method !== "POST") {
                return json(
                    {
                        success: false,
                        error:
                            "Method not allowed. Use POST."
                    },
                    405,
                    corsHeaders
                );
            }

            try {

                let body;

                try {
                    body = await request.json();
                } catch {
                    return json(
                        {
                            success: false,
                            error:
                                "Request body must be valid JSON"
                        },
                        400,
                        corsHeaders
                    );
                }

                const username =
                    body.username;

                const password =
                    body.password;


                if (
                    typeof username !==
                        "string" ||
                    typeof password !==
                        "string"
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Username and password are required"
                        },
                        400,
                        corsHeaders
                    );
                }


                // Find player
                const playerResponse =
                    await fetch(
                        `${env.SUPABASE_URL}/rest/v1/players?select=id,username,password_hash,created_at,last_login&username=eq.${encodeURIComponent(username)}&limit=1`,
                        {
                            headers: {
                                "apikey":
                                    env.SUPABASE_SECRET_KEY
                            }
                        }
                    );


                if (!playerResponse.ok) {
                    return json(
                        {
                            success: false,
                            error:
                                "Failed to find account"
                        },
                        500,
                        corsHeaders
                    );
                }


                const players =
                    await playerResponse.json();


                if (
                    !Array.isArray(players) ||
                    players.length === 0
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Invalid username or password"
                        },
                        401,
                        corsHeaders
                    );
                }


                const player =
                    players[0];


                // Stored format:
                //
                // pbkdf2$iterations$salt$hash
                //

                const parts =
                    player.password_hash.split(
                        "$"
                    );


                if (
                    parts.length !== 4 ||
                    parts[0] !== "pbkdf2"
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Account password data is invalid"
                        },
                        500,
                        corsHeaders
                    );
                }


                const iterations =
                    Number(parts[1]);

                const salt =
                    hexToBytes(parts[2]);

                const storedHash =
                    hexToBytes(parts[3]);


                // Verify password
                const calculatedHash =
                    await crypto.subtle.importKey(
                        "raw",
                        new TextEncoder().encode(
                            password
                        ),
                        {
                            name: "PBKDF2"
                        },
                        false,
                        ["deriveBits"]
                    );


                const derivedBits =
                    await crypto.subtle.deriveBits(
                        {
                            name: "PBKDF2",
                            salt: salt,
                            iterations:
                                iterations,
                            hash: "SHA-256"
                        },
                        calculatedHash,
                        256
                    );


                const calculatedBytes =
                    new Uint8Array(
                        derivedBits
                    );


                if (
                    !constantTimeEqual(
                        calculatedBytes,
                        storedHash
                    )
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Invalid username or password"
                        },
                        401,
                        corsHeaders
                    );
                }


                // Update last login
                await fetch(
                    `${env.SUPABASE_URL}/rest/v1/players?id=eq.${encodeURIComponent(player.id)}`,
                    {
                        method: "PATCH",

                        headers: {
                            "apikey":
                                env.SUPABASE_SECRET_KEY,
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            last_login:
                                new Date().toISOString()
                        })
                    }
                );


                // Create session
                const session =
                    await createSession(
                        env,
                        player.id
                    );


                return json(
                    {
                        success: true,
                        message:
                            "Login successful",

                        player: {
                            id: player.id,
                            username:
                                player.username,
                            created_at:
                                player.created_at
                        },

                        session: {
                            token:
                                session.token,
                            expires_at:
                                session.expiresAt
                        }
                    },
                    200,
                    corsHeaders
                );

            } catch (error) {

                return json(
                    {
                        success: false,
                        error:
                            "Login failed",
                        details:
                            error.message
                    },
                    500,
                    corsHeaders
                );
            }
        }


        // ====================================================
        // CURRENT ACCOUNT
        // ====================================================

        if (
            url.pathname ===
            "/api/auth/me"
        ) {

            if (request.method !== "GET") {
                return json(
                    {
                        success: false,
                        error:
                            "Method not allowed. Use GET."
                    },
                    405,
                    corsHeaders
                );
            }

            try {

                const session =
                    await getSession(
                        request,
                        env
                    );


                if (!session) {
                    return json(
                        {
                            success: false,
                            error:
                                "Not authenticated"
                        },
                        401,
                        corsHeaders
                    );
                }


                const playerResponse =
                    await fetch(
                        `${env.SUPABASE_URL}/rest/v1/players?select=id,username,created_at,last_login&id=eq.${encodeURIComponent(session.player_id)}&limit=1`,
                        {
                            headers: {
                                "apikey":
                                    env.SUPABASE_SECRET_KEY
                            }
                        }
                    );


                if (!playerResponse.ok) {
                    return json(
                        {
                            success: false,
                            error:
                                "Failed to load player"
                        },
                        500,
                        corsHeaders
                    );
                }


                const players =
                    await playerResponse.json();


                if (
                    !Array.isArray(players) ||
                    players.length === 0
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Player account no longer exists"
                        },
                        404,
                        corsHeaders
                    );
                }


                const player =
                    players[0];


                return json(
                    {
                        success: true,

                        player: {
                            id: player.id,
                            username:
                                player.username,
                            created_at:
                                player.created_at,
                            last_login:
                                player.last_login
                        },

                        session: {
                            expires_at:
                                session.expires_at
                        }
                    },
                    200,
                    corsHeaders
                );

            } catch (error) {

                return json(
                    {
                        success: false,
                        error:
                            "Failed to authenticate",
                        details:
                            error.message
                    },
                    500,
                    corsHeaders
                );
            }
        }


        // ====================================================
        // LOGOUT
        // ====================================================

        if (
            url.pathname ===
            "/api/auth/logout"
        ) {

            if (request.method !== "POST") {
                return json(
                    {
                        success: false,
                        error:
                            "Method not allowed. Use POST."
                    },
                    405,
                    corsHeaders
                );
            }

            try {

                const session =
                    await getSession(
                        request,
                        env
                    );


                if (!session) {
                    return json(
                        {
                            success: true,
                            message:
                                "Already logged out"
                        },
                        200,
                        corsHeaders
                    );
                }


                await fetch(
                    `${env.SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(session.id)}`,
                    {
                        method: "DELETE",

                        headers: {
                            "apikey":
                                env.SUPABASE_SECRET_KEY
                        }
                    }
                );


                return json(
                    {
                        success: true,
                        message:
                            "Logged out successfully"
                    },
                    200,
                    corsHeaders
                );

            } catch (error) {

                return json(
                    {
                        success: false,
                        error:
                            "Logout failed",
                        details:
                            error.message
                    },
                    500,
                    corsHeaders
                );
            }
        }


        // ====================================================
        // DEVELOPER ACCESS
        // ====================================================

        if (
            url.pathname ===
            "/api/dev"
        ) {

            const suppliedCode =
                url.searchParams.get(
                    "devcode"
                );


            if (!env.DEVCODE) {
                return json(
                    {
                        success: false,
                        error:
                            "Developer code is not configured"
                    },
                    500,
                    corsHeaders
                );
            }


            if (
                !suppliedCode ||
                suppliedCode !==
                    env.DEVCODE
            ) {
                return json(
                    {
                        success: false,
                        error:
                            "Developer access denied"
                    },
                    403,
                    corsHeaders
                );
            }


            return json(
                {
                    success: true,
                    section:
                        "Lostera Developer",
                    message:
                        "Developer access granted"
                },
                200,
                corsHeaders
            );
        }


        // ====================================================
        // UNKNOWN ENDPOINT
        // ====================================================

        return json(
            {
                success: false,
                error:
                    "Endpoint not found"
            },
            404,
            corsHeaders
        );
    }
};
