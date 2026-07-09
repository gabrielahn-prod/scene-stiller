"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        ...metadata,
        login_id: identifier,
      },
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

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
