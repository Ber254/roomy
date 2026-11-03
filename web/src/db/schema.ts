import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Todos los montos se guardan en unidades menores (centavos) como integer.
// Moneda de contabilidad de la casa: "USD" (stablecoin) por defecto.

export const paymentStatus = pgEnum("payment_status", [
  "pending", // quote pedido, esperando depósito
  "processing", // depósito detectado, Intents ejecutando
  "settled", // liquidado
  "failed",
  "refunded",
]);

export const guaranteeStatus = pgEnum("guarantee_status", [
  "pending",
  "deposited",
  "released",
  "slashed",
]);

export const houses = pgTable("houses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  currency: text("currency").notNull().default("USD"),
  // cuenta NEAR que recibe el alquiler (casero/hospedante)
  hostNearAccount: text("host_near_account"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    houseId: uuid("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    nearAccount: text("near_account"),
    isHost: boolean("is_host").notNull().default(false),
    // token de sesión simple (sin auth con wallet en el MVP)
    sessionToken: text("session_token").notNull().unique(),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [index("members_house_idx").on(t.houseId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    houseId: uuid("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "cascade" }),
    paidBy: uuid("paid_by")
      .notNull()
      .references(() => members.id),
    description: text("description").notNull(),
    category: text("category").notNull().default("general"), // rent | utilities | groceries | general
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("expenses_house_idx").on(t.houseId)],
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    shareCents: integer("share_cents").notNull(),
  },
  (t) => [uniqueIndex("splits_expense_member_uq").on(t.expenseId, t.memberId)],
);

// Liquidación de deuda entre dos roomies, vía NEAR Intents
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    houseId: uuid("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "cascade" }),
    fromMember: uuid("from_member")
      .notNull()
      .references(() => members.id),
    toMember: uuid("to_member")
      .notNull()
      .references(() => members.id),
    amountCents: integer("amount_cents").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    // datos de Intents (se completan cuando conozcamos el esquema real)
    originAsset: text("origin_asset"),
    destinationAsset: text("destination_asset"),
    depositAddress: text("deposit_address"),
    intentsStatus: text("intents_status"),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    settledAt: timestamp("settled_at"),
  },
  (t) => [index("payments_house_idx").on(t.houseId)],
);

export const guarantees = pgTable("guarantees", {
  id: uuid("id").primaryKey().defaultRandom(),
  houseId: uuid("house_id")
    .notNull()
    .references(() => houses.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  amountYocto: text("amount_yocto").notNull(), // NEAR en yocto, como string (excede integer)
  status: guaranteeStatus("status").notNull().default("pending"),
  escrowContract: text("escrow_contract"),
  depositTxHash: text("deposit_tx_hash"),
  releaseTxHash: text("release_tx_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    houseId: uuid("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => members.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_house_created_idx").on(t.houseId, t.createdAt)],
);

export const chores = pgTable("chores", {
  id: uuid("id").primaryKey().defaultRandom(),
  houseId: uuid("house_id")
    .notNull()
    .references(() => houses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  assignedTo: uuid("assigned_to").references(() => members.id),
  weekStart: timestamp("week_start").notNull(),
  done: boolean("done").notNull().default(false),
});

export const votes = pgTable("votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  houseId: uuid("house_id")
    .notNull()
    .references(() => houses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => members.id),
  closesAt: timestamp("closes_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const voteBallots = pgTable(
  "vote_ballots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voteId: uuid("vote_id")
      .notNull()
      .references(() => votes.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    inFavor: boolean("in_favor").notNull(),
  },
  (t) => [uniqueIndex("ballots_vote_member_uq").on(t.voteId, t.memberId)],
);
