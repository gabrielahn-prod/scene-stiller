"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const INTERNAL_EMAIL_DOMAIN = "nonmarket.app";

function getText(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function identifierToEmail(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    throw new Error("아이디를 입력해주세요.");
  }

  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw new Error("아이디는 영문 소문자, 숫자, ., _, - 조합으로 3~32자만 가능합니다.");
  }

  return `${normalized}@${INTERNAL_EMAIL_DOMAIN}`;
}

function getOwnerMetadata(formData: FormData) {
  const ownerName = getText(formData, "ownerName");
  const ownerAge = Number(getText(formData, "ownerAge"));
  const storeCount = Number(getText(formData, "storeCount"));
  const businessName = getText(formData, "businessName");

  if (!ownerName) throw new Error("사장님 이름을 입력해주세요.");
  if (!Number.isInteger(ownerAge) || ownerAge < 1 || ownerAge > 120) {
    throw new Error("나이를 올바르게 입력해주세요.");
  }
  if (!Number.isInteger(storeCount) || storeCount < 1 || storeCount > 999) {
    throw new Error("매장 수를 올바르게 입력해주세요.");
  }
  if (!businessName) throw new Error("사업자 이름을 입력해주세요.");

  return {
    owner_name: ownerName,
    owner_age: ownerAge,
    store_count: storeCount,
    business_name: businessName,
  };
}

async function saveOwnerProfile(
  supabase: any,
  userId: string,
  identifier: string,
  metadata: ReturnType<typeof getOwnerMetadata>
) {
  await supabase.from("owner_profiles").upsert({
    user_id: userId,
    login_id: identifier,
    owner_name: metadata.owner_name,
    owner_age: metadata.owner_age,
    store_count: metadata.store_count,
    business_name: metadata.business_name,
  });
}

export async function signIn(formData: FormData) {
  let email: string;

  try {
    email = identifierToEmail(getText(formData, "identifier"));
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent((error as Error).message)}`);
  }

  const password = getText(formData, "password");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard/videos");
}

export async function signUp(formData: FormData) {
  let email: string;
  let metadata: ReturnType<typeof getOwnerMetadata>;

  try {
    email = identifierToEmail(getText(formData, "identifier"));
    metadata = getOwnerMetadata(formData);
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent((error as Error).message)}`);
  }

  const identifier = getText(formData, "identifier").toLowerCase();
  const password = getText(formData, "password");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    redirect(
      `/login?error=${encodeURIComponent(
        "회원가입 설정이 필요합니다. Vercel에 SUPABASE_SERVICE_ROLE_KEY를 추가해주세요."
      )}`
    );
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      ...metadata,
      login_id: identifier,
    },
  });

  if (createError) {
    redirect(`/login?error=${encodeURIComponent(createError.message)}`);
  }

  const userId = createdUser.user?.id;
  if (userId) {
    await saveOwnerProfile(admin, userId, identifier, metadata);
  }

  const supabase = createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard/videos");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
