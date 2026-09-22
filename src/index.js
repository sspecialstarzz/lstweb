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
        // DATABASE DEBUG TEST
        // =========================

        if (url.pathname === "/api/db-test") {
            return Response.json(
                {
                    success: true,

                    // These only report whether the variables exist.
                    // They DO NOT expose their values.
                    supabaseUrlFound: !!env.SUPABASE_URL,
                    supabaseSecretKeyFound: !!env.SUPABASE_SECRET_KEY,

                    // Lengths help us determine whether
                    // Cloudflare is receiving the values.
                    supabaseUrlLength: env.SUPABASE_URL
                        ? env.SUPABASE_URL.length
                        : 0,

                    supabaseSecretKeyLength: env.SUPABASE_SECRET_KEY
                        ? env.SUPABASE_SECRET_KEY.length
                        : 0
                },
                {
                    headers: corsHeaders
                }
            );
        }

        // =========================
        // DEVELOPER ACCESS
        // =========================

        if (url.pathname === "/api/dev") {
            const suppliedCode = url.searchParams.get("devcode");

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

            if (!suppliedCode || suppliedCode !== env.DEVCODE) {
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
