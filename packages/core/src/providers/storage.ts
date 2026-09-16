import { S3Client, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from "livekit-server-sdk";
import { env } from "../env.js";

const R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
] as const;

export const storageConfigured = R2_KEYS.every((key) => Boolean(env[key]));

/** The one value behind both egress and the disclosure. Never read `recordCalls`
 *  directly, or the two can disagree. */
export function recordingEnabled(agent: { recordCalls: boolean }): boolean {
  return agent.recordCalls && storageConfigured;
}

function r2Config() {
  if (!storageConfigured) {
    throw new Error("Call recording storage is not configured; set the R2_* variables");
  }
  return {
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucket: env.R2_BUCKET_NAME!,
  };
}

// Built on first use, so an install without storage can still import this module.
let r2Client: S3Client | null = null;
let egressClient: EgressClient | null = null;

function getR2(): S3Client {
  const cfg = r2Config();
  r2Client ??= new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return r2Client;
}

function getEgress(): EgressClient {
  egressClient ??= new EgressClient(
    env.LIVEKIT_URL,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );
  return egressClient;
}

export function recordingKey(callId: string): string {
  return `recordings/${callId}.ogg`;
}

export async function startCallRecording(
  roomName: string,
  callId: string,
): Promise<{ egressId: string; recordingKey: string }> {
  const cfg = r2Config();
  const key = recordingKey(callId);

  const s3Upload = new S3Upload({
    accessKey: cfg.accessKeyId,
    secret: cfg.secretAccessKey,
    bucket: cfg.bucket,
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    region: "auto",
  });

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.OGG,
    filepath: key,
    output: { case: "s3", value: s3Upload },
  });

  // Room composite with audioOnly is LiveKit's documented path to one mixed
  // audio file; setting layout or customBaseUrl forces the video pipeline.
  const egress = await getEgress().startRoomCompositeEgress(roomName, output, {
    audioOnly: true,
  });

  console.log(`[storage] egress started: ${egress.egressId} for room ${roomName}`);
  return { egressId: egress.egressId, recordingKey: key };
}

export async function stopCallRecording(egressId: string): Promise<void> {
  await getEgress().stopEgress(egressId);
  console.log(`[storage] egress stopped: ${egressId}`);
}

export async function getPresignedRecordingUrl(callId: string): Promise<string> {
  const cfg = r2Config();
  return getSignedUrl(
    getR2(),
    new GetObjectCommand({ Bucket: cfg.bucket, Key: recordingKey(callId) }),
    { expiresIn: 3600 },
  );
}

export async function deleteRecording(callId: string): Promise<void> {
  const cfg = r2Config();
  await getR2().send(
    new DeleteObjectCommand({ Bucket: cfg.bucket, Key: recordingKey(callId) }),
  );
}
