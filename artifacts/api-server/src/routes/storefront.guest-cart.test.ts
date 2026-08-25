import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { customersTable, db, ordersTable } from "@workspace/db";
import app from "../app";
import { addToCart } from "../lib/storefront";

const phones: string[] = [];

afterEach(async () => {
  if (!phones.length) return;
  const users = await db.select({ id: customersTable.id }).from(customersTable).where(inArray(customersTable.phone, phones));
  const ids = users.map(({ id }) => id);
  if (ids.length) {
    await db.delete(ordersTable).where(inArray(ordersTable.userId, ids));
    await db.delete(customersTable).where(inArray(customersTable.id, ids));
  }
  phones.length = 0;
});

describe.sequential("guest cart routes", () => {
  it("issues isolated opaque guest cookies for unauthenticated carts", async () => {
    const first = request.agent(app);
    const second = request.agent(app);
    const firstCart = await first.post("/api/cart/items").send({ productId: 1, quantity: 2 }).expect(200);
    const secondCart = await second.get("/api/cart").expect(200);

    expect(firstCart.body.itemCount).toBe(2);
    expect(secondCart.body.items).toEqual([]);
    const cookie = String(firstCart.headers["set-cookie"]);
    expect(cookie).toMatch(/musk_ellolo_guest_cart=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api/);
  });

  it("merges into an existing customer cart without duplicates and caps quantity at stock", async () => {
    const phone = `+966599${Date.now()}`;
    phones.push(phone);
    await request(app).post("/api/auth/request-otp").send({ phone }).expect(200);
    const initialLogin = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, code: "123456" })
      .expect(200);
    await addToCart(initialLogin.body.user.id, 2, 95);

    const otherPhone = `+966598${Date.now()}`;
    phones.push(otherPhone);
    await request(app).post("/api/auth/request-otp").send({ phone: otherPhone }).expect(200);
    const otherLogin = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone: otherPhone, code: "123456" })
      .expect(200);
    await addToCart(otherLogin.body.user.id, 3, 1);

    const agent = request.agent(app);
    await agent.post("/api/cart/items").send({ productId: 2, quantity: 10 }).expect(200);
    await agent.post("/api/auth/request-otp").send({ phone }).expect(200);
    const verified = await agent.post("/api/auth/verify-otp").send({ phone, code: "123456" }).expect(200);

    expect(String(verified.headers["set-cookie"])).toMatch(/musk_ellolo_guest_cart=;/);
    const cart = await request(app).get("/api/cart").set("Authorization", `Bearer ${verified.body.token}`).expect(200);
    expect(cart.body.items).toHaveLength(1);
    expect(cart.body.itemCount).toBe(100);
    expect(cart.body.items[0].product.id).toBe(2);
    expect(cart.body.items[0].quantity).toBe(100);

    const otherCart = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${otherLogin.body.token}`)
      .expect(200);
    expect(otherCart.body.itemCount).toBe(1);
    expect(otherCart.body.items[0].product.id).toBe(3);
  });
});