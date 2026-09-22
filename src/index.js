const PBKDF2_ITERATIONS = 310000;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 16;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        };

        // =========================
        // CORS
        // =========================

        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders
            });
        }

        // =========================
        // API STATUS
        // =========================

        if (url.pathname === "/api/status") {
            return Response.json(
                {
                    success: true,
                    service: "Lostera API",
                    status: "online",
                    version: "1.0.0"
                },
                {
                    headers: corsHeaders
                }
            );
        }

        // =========================
        // DATABASE TEST
        // =========================

        if (url.pathname === "/api/db-test") {
            if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
                return Response.json(
                    {
                        success: false,
                        error: "Supabase environment variables are missing"
                    },
                    {
                        status: 500,
                        headers: corsHeaders
                    }
                );
            }

            try {
                const response = await fetch(
                    `${env.SUPABASE_URL}/rest/v1/players?select=id&limit=1`,
                    {
                        method: "GET",
                        headers: {
                            "apikey": env.SUPABASE_SECRET_KEY
                        }
                    }
                );

                const responseText = await response.text();

                if (!response.ok) {
                    return Response.json(
                        {
                            success: false,
                            error: "Database request failed",
                            status: response.status,
                            details: responseText
                        },
                        {
                            status: 500,
                            headers: corsHeaders
                        }
                    );
                }

                const players = JSON.parse(responseText);

                return Response.json(
                    {
                        success: true,
                        database: "connected",
                        table: "players",
                        playersFound: players.length
                    },
                    {
                        headers: corsHeaders
                    }
                );

            } catch (error) {
                return Response.json(
                    {
                        success: false,
                        error: "Database connection error",
                        details: error.message
                    },
                    {
                        status: 500,
                        headers: corsHeaders
                    }
                );
            }
        }

        // =========================
        // REGISTER
        // =========================

        if (url.pathname === "/api/auth/register") {

            // Only POST is allowed
            if (request.method !== "POST") {
                return Response.json(
                    {
                        success: false,
                        error: "Method not allowed. Use POST."
                    },
                    {
                        status: 405,
                        headers: corsHeaders
                    }
                );
            }

            try {
                // Make sure database credentials exist
                if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
                    return Response.json(
                        {
                            success: false,
                            error: "Database configuration is missing"
                        },
                        {
                            status: 500,
                            headers: corsHeaders
                        }
                    );
                }

                // =========================
                // READ REQUEST BODY
                // =========================

                let body;

                try {
                    body = await request.json();
                } catch {
                    return Response.json(
                        {
                            success: false,
                            error: "Request body must be valid JSON"
                        },
                        {
                            status: 400,
                            headers: corsHeaders
                        }
                    );
                }

                const username = body.username;
                const password = body.password;

                // =========================
                // BASIC TYPE VALIDATION
                // =========================

                if (
                    typeof username !== "string" ||
                    typeof password !== "string"
                ) {
                    return Response.json(
                        {
                            success: false,
                            error: "Username and password are required"
                        },
                        {
                            status: 400,
                            headers: corsHeaders
                        }
                    );
                }

                // Don't silently modify the username.
                // This prevents confusing accounts such as
                // "Player" and " Player ".
                if (username !== username.trim()) {
                    return Response.json(
                        {
                            success: false,
                            error: "Username cannot begin or end with spaces"
                        },
                        {
                            status: 400,
                            headers: corsHeaders
                        }
                    );
                }

                // =========================
                // USERNAME VALIDATION
                // =========================

                if (
                    username.length < USERNAME_MIN_LENGTH ||
                    username.length > USERNAME_MAX_LENGTH
                ) {
                    return Response.json(
                        {
                            success: false,
                            error: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`
                        },
                        {
                            status: 400,
                            headers: corsHeaders
                        }
                    );
                }

                // Letters, numbers, and underscores only
                if (!/^[A-Za-z0-9_]+$/.test(username)) {
                    return Response.json(
                        {
                            success: false,
                            error: "Username can only contain letters, numbers, and underscores"
                        },
                        {
                            status: 400,
                            headers: corsHeaders
                        }
                    );
                }

                // =========================
                // PASSWORD VALIDATION
                // =========================

                if (
                    password.length < PASSWORD_MIN_LENGTH ||
                    password.length > PASSWORD_MAX_LENGTH
                ) {
                    return Response.json(
                        {
                            success: false,
                            error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
                        },
                        {
                            status: 400,
                            headers: corsHeaders
                        }
                    );
                }

                // =========================
                // CHECK USERNAME
                // =========================

                const usernameCheckResponse = await fetch(
                    `${env.SUPABASE_URL}/rest/v1/players?select=id&username=eq.${encodeURIComponent(username)}&limit=1`,
                    {
                        method: "GET",
                        headers: {
                            "apikey": env.SUPABASE_SECRET_KEY
                        }
                    }
                );

                if (!usernameCheckResponse.ok) {
                    const errorText =
                        await usernameCheckResponse.text();

                    return Response.json(
                        {
                            success: false,
                            error: "Failed to check username",
                            details: errorText
                        },
                        {
                            status: 500,
                            headers: corsHeaders
                        }
                    );
                }

                const existingPlayers =
                    await usernameCheckResponse.json();

                if (existingPlayers.length > 0) {
                    return Response.json(
                        {
                            success: false,
                            error: "Username is already taken"
                        },
                        {
                            status: 409,
                            headers: corsHeaders
                        }
                    );
                }

                // =========================
                // GENERATE PASSWORD SALT
                // =========================

                const salt = crypto.getRandomValues(
                    new Uint8Array(16)
                );

                // =========================
                // CREATE PBKDF2 KEY
                // =========================

                const passwordKey =
                    await crypto.subtle.importKey(
                        "raw",
                        new TextEncoder().encode(password),
                        {
                            name: "PBKDF2"
                        },
                        false,
                        [
                            "deriveBits"
                        ]
                    );

                // =========================
                // HASH PASSWORD
                // =========================

                const derivedBits =
                    await crypto.subtle.deriveBits(
                        {
                            name: "PBKDF2",
                            salt: salt,
                            iterations: PBKDF2_ITERATIONS,
                            hash: "SHA-256"
                        },
                        passwordKey,
                        256
                    );

                const passwordHash = new Uint8Array(
                    derivedBits
                );

                // =========================
                // CONVERT TO HEX
                // =========================

                const bytesToHex = (bytes) =>
                    Array.from(bytes)
                        .map(byte =>
                            byte.toString(16).padStart(2, "0")
                        )
                        .join("");

                const saltHex = bytesToHex(salt);
                const hashHex = bytesToHex(passwordHash);

                // Store everything needed to verify the
                // password later inside password_hash.
                //
                // Format:
                // pbkdf2$iterations$salt$hash

                const storedPasswordHash =
                    `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;

                // =========================
                // CREATE PLAYER
                // =========================

                const createResponse = await fetch(
                    `${env.SUPABASE_URL}/rest/v1/players`,
                    {
                        method: "POST",
                        headers: {
                            "apikey": env.SUPABASE_SECRET_KEY,
                            "Content-Type": "application/json",
                            "Prefer": "return=representation"
                        },
                        body: JSON.stringify({
                            username: username,
                            password_hash: storedPasswordHash
                        })
                    }
                );

                const createResponseText =
                    await createResponse.text();

                if (!createResponse.ok) {

                    // PostgreSQL unique constraint
                    // can still catch a duplicate if two
                    // registrations happen simultaneously.
                    if (createResponse.status === 409) {
                        return Response.json(
                            {
                                success: false,
                                error: "Username is already taken"
                            },
                            {
                                status: 409,
                                headers: corsHeaders
                            }
                        );
                    }

                    return Response.json(
                        {
                            success: false,
                            error: "Failed to create account",
                            details: createResponseText
                        },
                        {
                            status: 500,
                            headers: corsHeaders
                        }
                    );
                }

                const createdPlayers =
                    JSON.parse(createResponseText);

                if (
                    !Array.isArray(createdPlayers) ||
                    createdPlayers.length === 0
                ) {
                    return Response.json(
                        {
                            success: false,
                            error: "Account was created but no player data was returned"
                        },
                        {
                            status: 500,
                            headers: corsHeaders
                        }
                    );
                }

                const player = createdPlayers[0];

                // =========================
                // SUCCESS
                // =========================

                return Response.json(
                    {
                        success: true,
                        message: "Account created successfully",
                        player: {
                            id: player.id,
                            username: player.username,
                            created_at: player.created_at
                        }
                    },
                    {
                        status: 201,
                        headers: corsHeaders
                    }
                );

            } catch (error) {

                return Response.json(
                    {
                        success: false,
                        error: "Registration failed",
                        details: error.message
                    },
                    {
                        status: 500,
                        headers: corsHeaders
                    }
                );
            }
        }

        // =========================
        // DEVELOPER ACCESS
        // =========================

        if (url.pathname === "/api/dev") {

            const suppliedCode =
                url.searchParams.get("devcode");

            if (!env.DEVCODE) {
                return Response.json(
                    {
                        success: false,
                        error: "Developer code is not configured"
                    },
                    {
                        status: 500,
                        headers: corsHeaders
                    }
                );
            }

            if (
                !suppliedCode ||
                suppliedCode !== env.DEVCODE
            ) {
                return Response.json(
                    {
                        success: false,
                        error: "Developer access denied"
                    },
                    {
                        status: 403,
                        headers: corsHeaders
                    }
                );
            }

            return Response.json(
                {
                    success: true,
                    section: "Lostera Developer",
                    message: "Developer access granted"
                },
                {
                    headers: corsHeaders
                }
            );
        }

        // =========================
        // UNKNOWN ENDPOINT
        // =========================

        return Response.json(
            {
                success: false,
                error: "Endpoint not found"
            },
            {
                status: 404,
                headers: corsHeaders
            }
        );
    }
};
