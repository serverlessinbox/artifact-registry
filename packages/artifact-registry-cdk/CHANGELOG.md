
# Changelog

All notable changes to this project will be documented in this file


## [0.3.4](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.3...v0.3.4) (Fri Oct 16 2026)



## [0.3.3](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.2...v0.3.3) (Mon Oct 12 2026)

### docs

* Added mermaid diagrams ([2173753](https://github.com/serverlessinbox/artifact-registry/commit/217375307f0f937140d25442456db1f635382125))

## [0.3.2](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.1...v0.3.2) (Mon Oct 12 2026)



## [0.3.1](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.0...v0.3.1) (Mon Oct 12 2026)

### docs

* Updated readme to follow the new cdk package ([433f280](https://github.com/serverlessinbox/artifact-registry/commit/433f2808c6a01dbf3e2cd9bcf997f62771da2b32))

## [0.3.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.2.0...v0.3.0) (Sun Oct 11 2026)

### feat

* registry read access scoped to {project}/*, no listing for readers; optional readAllowlist ([d5840e5](https://github.com/serverlessinbox/artifact-registry/commit/d5840e5623abc03e7fae2f075b2abe08f48efd3a))

## [0.2.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.3...v0.2.0) (Fri Oct 09 2026)

### refactor

* artifact-registry-cdk buckets construct moves to src/buckets/ ([5b3fe82](https://github.com/serverlessinbox/artifact-registry/commit/5b3fe82c5db3b9756ff3304f361471802d80ea01))

### feat

* artifact-registry-cdk resolution contract (jsii) pinned to the core types ([4322d5c](https://github.com/serverlessinbox/artifact-registry/commit/4322d5c064553b82c58dc0f4e5150713c2fb918d))

* artifact-registry-cdk PinnedArtifactResolver and ArtifactCode (an S3Code) ([4a33a5d](https://github.com/serverlessinbox/artifact-registry/commit/4a33a5dc9bf15cce97a46329af10b87f7b78b415))

### test

* PinnedArtifactResolver and ArtifactCode ([f4e371c](https://github.com/serverlessinbox/artifact-registry/commit/f4e371cd6b75b9a9015a7c057d3b552c3c71e1b1))

### chore

* typanion as artifact-registry-cdk devDependency (inlined at pack) ([81aa3d7](https://github.com/serverlessinbox/artifact-registry/commit/81aa3d7f790423386f0ee87b0285072ca4b576e0))

## [0.1.3](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.2...v0.1.3) (Tue Oct 06 2026)

### feat

* ArtifactRegistryBuckets is environment-agnostic (explicit region list, deploy-time bucket lookup and region rule) ([33cd7cf](https://github.com/serverlessinbox/artifact-registry/commit/33cd7cf72a06118a2129b9bcaa89e3de2f6c5adb))

## [0.1.2](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.1...v0.1.2) (Tue Oct 06 2026)

### build

* artifact-registry-cdk jsii scaffold, bundled with jsii-bundler ([e863c91](https://github.com/serverlessinbox/artifact-registry/commit/e863c91eb9f8cbef3dca8cfae2a6a5a0fc963a3c))

### feat

* ArtifactRegistryBuckets construct (StackSet buckets per region, registry record in the stack region) ([d4767ca](https://github.com/serverlessinbox/artifact-registry/commit/d4767cac6112c9815220e0cd648e8492667c08c5))

### test

* ArtifactRegistryBuckets construct tests ([527f5a2](https://github.com/serverlessinbox/artifact-registry/commit/527f5a20b1ae5795bac0af298daa994cff7f707d))
