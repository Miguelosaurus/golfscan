import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

// Clerk webhook event type (minimal definition for our use case)
type WebhookEvent = {
  type: string;
  data: {
    id?: string;
    [key: string]: any;
  };
};

const http = httpRouter();

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payloadString = await request.text();
    const headerPayload = request.headers;

    const svixId = headerPayload.get("svix-id");
    const svixTimestamp = headerPayload.get("svix-timestamp");
    const svixSignature = headerPayload.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing Svix headers", { status: 400 });
    }

    const secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!secret) {
      console.error("CLERK_WEBHOOK_SECRET not found in environment");
      return new Response("Configuration error: Missing webhook secret", { status: 500 });
    }

    const wh = new Webhook(secret); // Use the secret WITH the whsec_ prefix
    let event: WebhookEvent;

    try {
      event = wh.verify(payloadString, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data,
        });
        break;
      case "user.deleted":
        if (event.data.id) {
          await ctx.runMutation(internal.users.deleteFromClerk, {
            clerkUserId: event.data.id,
          });
        }
        break;
      default:
        console.log(`Ignored Clerk event type: ${event.type}`);
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
