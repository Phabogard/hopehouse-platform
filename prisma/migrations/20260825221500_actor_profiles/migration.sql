CREATE TABLE "client_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('active', 'inactive', 'suspended', 'archived')),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_profiles_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "client_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);

CREATE TABLE "agent_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('active', 'inactive', 'suspended', 'archived')),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_profiles_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "agent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);
