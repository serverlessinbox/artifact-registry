import type { RegistryLocation as CoreRegistryLocation } from '@serverlessinbox/artifact-registry/registry';
import type {
  ArtifactZone as CoreArtifactZone,
  ResolvedArtifact as CoreResolvedArtifact,
} from '@serverlessinbox/artifact-registry/resolution';
import type { ArtifactZone, RegistryLocation, ResolvedArtifact } from './artifact-resolution';

/*
 * The jsii structs of this package mirror three core types, because a jsii assembly cannot name a
 * core type. These compile-time assertions fail `tsc` when a mirror and its core type drift apart.
 * The file exports nothing, so its declaration file names no core type; `noUnusedLocals` rejects an
 * unused alias, which is why the checks are read once below.
 */

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Same property names and mutually assignable property types; mutual assignability alone ignores an added optional property. */
type SameShape<A, B> = MutuallyAssignable<A, B> extends true ? MutuallyAssignable<keyof A, keyof B> : false;

type AssertTrue<T extends true> = T;

type ParityChecks = [
  AssertTrue<SameShape<ResolvedArtifact, CoreResolvedArtifact>>,
  AssertTrue<SameShape<RegistryLocation, CoreRegistryLocation>>,
  AssertTrue<MutuallyAssignable<`${ArtifactZone}`, CoreArtifactZone>>,
];

const parityChecks: ParityChecks = [true, true, true];
void parityChecks;
