export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // CORS
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization"
                }
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
                headers: {
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // Unknown endpoint
        return Response.json({
            success: false,
            error: "Endpoint not found"
        }, {
            status: 404,
            headers: {
                "Access-Control-Allow-Origin": "*"
            }
        });
    }
};
