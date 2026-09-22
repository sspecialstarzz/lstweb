export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        };

        // CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders
            });
        }

        // API status
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

        // Developer section
        if (url.pathname === "/api/dev") {

            const suppliedCode = url.searchParams.get("devcode");

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

        // Unknown endpoint
        return Response.json({
            success: false,
            error: "Endpoint not found"
        }, {
            status: 404,
            headers: corsHeaders
        });
    }
};
