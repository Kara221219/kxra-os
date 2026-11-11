"use server";

import { redirect } from "next/navigation";
import { actor, HttpError } from "../../lib/auth";
import {
  addSupportNote,
  requestAccountState,
  resendInvitation,
} from "../../lib/platform-admin";

export async function requestAccountChange(formData: FormData) {
  const userId = String(formData.get("user_id") || "");
  const desired = String(formData.get("desired_state") || "");
  const back = `/admin/users/${userId}`;
  if (formData.get("confirm") !== "CONFIRM")
    redirect(`${back}?error=${encodeURIComponent("Confirmation is required")}`);
  if (desired !== "ACTIVE" && desired !== "SUSPENDED")
    redirect(
      `${back}?error=${encodeURIComponent("Choose suspend or reactivate")}`,
    );
  try {
    await requestAccountState(
      await actor(),
      userId,
      desired,
      String(formData.get("reason") || ""),
    );
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : "The approval could not be requested";
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }
  redirect(`${back}?requested=1`);
}

export async function saveSupportNote(formData: FormData) {
  const requestId = String(formData.get("request_id") || "");
  if (formData.get("confirm") !== "CONFIRM")
    redirect("/admin/support?error=Confirmation%20is%20required");
  try {
    await addSupportNote(
      await actor(),
      requestId,
      String(formData.get("note") || ""),
    );
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : "The note could not be saved";
    redirect(`/admin/support?error=${encodeURIComponent(message)}`);
  }
  redirect("/admin/support?noted=1");
}

export async function resendInvite(formData: FormData) {
  const invitationId = String(formData.get("invitation_id") || "");
  if (formData.get("confirm") !== "CONFIRM")
    redirect("/admin/users?error=Confirmation%20is%20required");
  try {
    await resendInvitation(await actor(), invitationId);
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : "The invitation could not be resent";
    redirect(`/admin/users?error=${encodeURIComponent(message)}`);
  }
  redirect("/admin/users?resent=1");
}
