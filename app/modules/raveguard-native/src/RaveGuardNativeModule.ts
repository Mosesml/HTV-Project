import { NativeModule, requireNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

import type {
  NoiseBackend,
  PinResultKind,
  RaveGuardEventName,
  RaveGuardEvents,
  Settings,
  Snapshot,
} from './RaveGuardNative.types';

/** The Swift module's surface (ios/RaveGuardModule.swift). Screens use the checked wrappers in index.ts. */
export interface RaveGuardNativeApi {
  configure(settings: Settings): Promise<void>;
  startSession(): Promise<void>;
  /** False while a check-in or escalation is open: those must be answered first. */
  stopSession(): Promise<boolean>;
  tapCancel(): Promise<void>;
  pinResult(kind: PinResultKind): Promise<void>;
  setProtectionLevel(level: number): Promise<void>;
  setNoiseBackend(kind: NoiseBackend): Promise<void>;
  debugFire(scenario: number): Promise<void>;
  debugSetOffline(on: boolean): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
  addListener<E extends RaveGuardEventName>(event: E, listener: RaveGuardEvents[E]): EventSubscription;
}

declare class RaveGuardNativeModule
  extends NativeModule<RaveGuardEvents>
  implements RaveGuardNativeApi
{
  configure(settings: Settings): Promise<void>;
  startSession(): Promise<void>;
  stopSession(): Promise<boolean>;
  tapCancel(): Promise<void>;
  pinResult(kind: PinResultKind): Promise<void>;
  setProtectionLevel(level: number): Promise<void>;
  setNoiseBackend(kind: NoiseBackend): Promise<void>;
  debugFire(scenario: number): Promise<void>;
  debugSetOffline(on: boolean): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
}

export default requireNativeModule<RaveGuardNativeModule>('RaveGuardNative');
