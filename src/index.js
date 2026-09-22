export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        };

        // CORS
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders
            });
        }

        // =========================
        // API STATUS
        // =========================

        if (url.pathname === "/api/status") {
            return Response.json({
                success: true,
                service: "Lostera API",
                status: "online",
                version: "1.0.0"
            }, {
                headers: corsHeaders
            });
        }

        // =========================
        // DATABASE TEST
        // =========================

        if (url.pathname === "/api/db-test") {

            if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
                return Response.json({
                    success: false,
                    error: "Supabase environment variables are missing"
                }, {
                    status: 500,
                    headers: corsHeaders
                });
            }

            const response = await fetch(
                `${env.SUPABASE_URL}/rest/v1/players?select=id&limit=1`,
                {
                    method: "GET",
                    headers: {
                        "apikey": env.SUPABASE_SECRET_KEY
                    }
                }
            );

            if (!response.ok) {
                const errorText = await response.text();

                return Response.json({
                    success: false,
                    error: "Database request failed",
                    details: errorText
                }, {
                    status: 500,
                    headers: corsHeaders
                });
            }

            const players = await response.json();

            return Response.json({
                success: true,
                database: "connected",
                table: "players",
                playersFound: players.length
            }, {
                headers: corsHeaders
            });
        }

        // =========================
        // DEVELOPER ACCESS
        // =========================

        if (url.pathname === "/api/dev") {

            const suppliedCode = url.searchParams.get("devcode");

            if (!env.DEVCODE) {
                return Response.json({
                    success: false,
                    error: "Developer code is not configured"
                }, {
                    status: 500,
                    headers: corsHeaders
                });
            }

            if (!suppliedCode || suppliedCode !== env.DEVCODE) {
                return Response.json({
                    success: false,
                    error: "Developer access denied"
                }, {
                    status: 403,
                    headers: corsHeaders
                });
            }

            return Response.json({
                success: true,
                section: "Lostera Developer",
                message: "Developer access granted"
            }, {
                headers: corsHeaders
            });
        }

        // =========================
        // UNKNOWN ENDPOINT
        // =========================

        return Response.json({
            success: false,
            error: "Endpoint not found"
        }, {
            status: 404,
            headers: corsHeaders
        });
    }
};

