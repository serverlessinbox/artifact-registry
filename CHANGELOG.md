
# Changelog

All notable changes to this project will be documented in this file


## [0.3.3](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.2...v0.3.3) (Mon Oct 12 2026)

### docs

* Added mermaid diagrams ([2173753](https://github.com/serverlessinbox/artifact-registry/commit/217375307f0f937140d25442456db1f635382125))

## [0.3.2](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.1...v0.3.2) (Mon Oct 12 2026)

### docs

* Removed internal package from root readme ([7e36ce4](https://github.com/serverlessinbox/artifact-registry/commit/7e36ce44987f11da9836d4904e88ad416cce3a96))

## [0.3.1](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.0...v0.3.1) (Mon Oct 12 2026)

### docs

* Updated readme to follow the new cdk package ([433f280](https://github.com/serverlessinbox/artifact-registry/commit/433f2808c6a01dbf3e2cd9bcf997f62771da2b32))

## [0.3.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.2.0...v0.3.0) (Sun Oct 11 2026)

### ci

* release runs the tests before packing; dead publish job removed ([b7b48b6](https://github.com/serverlessinbox/artifact-registry/commit/b7b48b6875e9329f5814b216f7540d70060ea556))

### feat

* registry read access scoped to {project}/*, no listing for readers; optional readAllowlist ([d5840e5](https://github.com/serverlessinbox/artifact-registry/commit/d5840e5623abc03e7fae2f075b2abe08f48efd3a))

### fix

* **ci** yarn 4.16.0 so jest runs on Node ≥ 24.16 in the release ([26e1a3d](https://github.com/serverlessinbox/artifact-registry/commit/26e1a3d5bbe7957aa5e4f61f8bbad533442bd573))

## [0.2.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.3...v0.2.0) (Fri Oct 09 2026)

### refactor

* core ./resolution subpath with the resolver closure, free of S3/esbuild ([8804cc0](https://github.com/serverlessinbox/artifact-registry/commit/8804cc00ec7410803d80e8750d8119106f40f775))

* remove core IArtifactResolver and ArtifactResolver.getLocation() ([385ea8d](https://github.com/serverlessinbox/artifact-registry/commit/385ea8d62c1d6dc58eb512d65bf865c2656fb058))

* artifact-registry-cdk buckets construct moves to src/buckets/ ([5b3fe82](https://github.com/serverlessinbox/artifact-registry/commit/5b3fe82c5db3b9756ff3304f361471802d80ea01))

### feat

* resolve-artifacts takes a zone per component and writes { version, zone } ([eb9286d](https://github.com/serverlessinbox/artifact-registry/commit/eb9286d31ba907a9f880bd0789c54e833eeb5c85))

* artifact-registry-cdk resolution contract (jsii) pinned to the core types ([4322d5c](https://github.com/serverlessinbox/artifact-registry/commit/4322d5c064553b82c58dc0f4e5150713c2fb918d))

* artifact-registry-cdk PinnedArtifactResolver and ArtifactCode (an S3Code) ([4a33a5d](https://github.com/serverlessinbox/artifact-registry/commit/4a33a5dc9bf15cce97a46329af10b87f7b78b415))

### test

* one typed S3 body helper; fixes 9 suites that only passed from the jest cache ([41ed427](https://github.com/serverlessinbox/artifact-registry/commit/41ed427135c8e52afb32e040093e2f260f68843c))

* PinnedArtifactResolver and ArtifactCode ([f4e371c](https://github.com/serverlessinbox/artifact-registry/commit/f4e371cd6b75b9a9015a7c057d3b552c3c71e1b1))

### chore

* typanion as artifact-registry-cdk devDependency (inlined at pack) ([81aa3d7](https://github.com/serverlessinbox/artifact-registry/commit/81aa3d7f790423386f0ee87b0285072ca4b576e0))

## [0.1.3](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.2...v0.1.3) (Tue Oct 06 2026)

### feat

* ArtifactRegistryBuckets is environment-agnostic (explicit region list, deploy-time bucket lookup and region rule) ([33cd7cf](https://github.com/serverlessinbox/artifact-registry/commit/33cd7cf72a06118a2129b9bcaa89e3de2f6c5adb))

## [0.1.2](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.1...v0.1.2) (Tue Oct 06 2026)

### feat

* registry record type, loader and registry-record fetch|check commands ([97b39fe](https://github.com/serverlessinbox/artifact-registry/commit/97b39fe03b096b02ab01be5f964685d04555dd0d))

* ArtifactRegistryBuckets construct (StackSet buckets per region, registry record in the stack region) ([d4767ca](https://github.com/serverlessinbox/artifact-registry/commit/d4767cac6112c9815220e0cd648e8492667c08c5))

* Added region flag to check registry records ([73ba27d](https://github.com/serverlessinbox/artifact-registry/commit/73ba27d5807313ce26199cad3567d59272552b85))

### refactor

* one class per file (RegionPublishError, ArtifactResolver), enforced by lint ([ff157d6](https://github.com/serverlessinbox/artifact-registry/commit/ff157d6f949824692a8a8a81a4dbd4854b6d9928))

* imports follow the registry module ([c98b9a5](https://github.com/serverlessinbox/artifact-registry/commit/c98b9a53eeaffc17a71ae95964ba083e24d4c5dc))

* registry subpath export (@serverlessinbox/artifact-registry/registry), loader split out, unused-code checks on ([363c1e4](https://github.com/serverlessinbox/artifact-registry/commit/363c1e4717395b3610c9317728e47d32b8b6438a))

### test

* one test file per source file; registry record and command tests ([8989cae](https://github.com/serverlessinbox/artifact-registry/commit/8989caeb8ab7b46817c2bac872322a8970a67819))

* jsii-bundler unit tests ([ec34eeb](https://github.com/serverlessinbox/artifact-registry/commit/ec34eebc06f4697c720dbc65aef46d3e1c396236))

* registry and record-loader tests follow their sources; registry subpath exports pinned ([3654c02](https://github.com/serverlessinbox/artifact-registry/commit/3654c02b17ec29f31fe8f18ec92fc887440aab7a))

* ArtifactRegistryBuckets construct tests ([527f5a2](https://github.com/serverlessinbox/artifact-registry/commit/527f5a20b1ae5795bac0af298daa994cff7f707d))

### docs

* registry record and registry-record commands ([cbfbd34](https://github.com/serverlessinbox/artifact-registry/commit/cbfbd3409853b69382ba846bed40219ec28bdbb6))

* jsii-bundler README and LICENSE ([8e659c4](https://github.com/serverlessinbox/artifact-registry/commit/8e659c45d58a04dfc2a045e28820333b6cef82b1))

* registry subpath, check exit codes, pointer access-denied ([b3cddf1](https://github.com/serverlessinbox/artifact-registry/commit/b3cddf1290567e83ac1cb8eb171df98547945ca2))

### build

* jsii-bundler (copied from mailbox-bundler) as a private workspace package ([de79bbe](https://github.com/serverlessinbox/artifact-registry/commit/de79bbea564ccd9e0f323ed798f4bd14f232f4f4))

* artifact-registry-cdk jsii scaffold, bundled with jsii-bundler ([e863c91](https://github.com/serverlessinbox/artifact-registry/commit/e863c91eb9f8cbef3dca8cfae2a6a5a0fc963a3c))

### chore

* Jsii deps ([a6cec89](https://github.com/serverlessinbox/artifact-registry/commit/a6cec89885a21b5032a568d741b0882203ff59c9))

* Testing with jsii ([a956f04](https://github.com/serverlessinbox/artifact-registry/commit/a956f0458594738099e71af9c953a619fa7fd650))

## [0.1.1](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.0...v0.1.1) (Mon Oct 05 2026)

### chore

* Main repo readme ([23f174e](https://github.com/serverlessinbox/artifact-registry/commit/23f174e8721ca0200e7574db70f7c662259811ff))

## [0.1.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.37...v0.1.0) (Mon Oct 05 2026)

### chore

* Underscore cleanup ([e97eeec](https://github.com/serverlessinbox/artifact-registry/commit/e97eeece86a37c2d2a8176930c82adb265b2cbea))

* License handling ([44a632d](https://github.com/serverlessinbox/artifact-registry/commit/44a632d987f94780f751eaf87ba4d1595be2b991))

* Linting ([68480f8](https://github.com/serverlessinbox/artifact-registry/commit/68480f8496fb2eea6727e7f6104ba8afea0d0ead))

* gate src with strict lint (no type assertions) and add typanion ([a107de0](https://github.com/serverlessinbox/artifact-registry/commit/a107de0da2b08c33107d3a6597d650c039dcaf5a))

* convert artifact-registry into a yarn workspace (packages/artifact-registry) ([4c4de94](https://github.com/serverlessinbox/artifact-registry/commit/4c4de94d3e907a94d0ee4823280acdf2db8cfed3))

* publish readiness (clean dist, engines, repository, release from main only) ([ef415d3](https://github.com/serverlessinbox/artifact-registry/commit/ef415d35b5f72af47a02c1cd21c291ed1e0a1c02))

### refactor

* domain modules artifact/release; S3 clients injected by entry points ([5975f52](https://github.com/serverlessinbox/artifact-registry/commit/5975f52fa99410e06d91164a82961eb829caf291))

* one validated ReleasePointer loader; loaders take an injected S3 client ([75230cf](https://github.com/serverlessinbox/artifact-registry/commit/75230cf7b632a153d024ea0f3b7f1e3241cfbf7f))

* domain folders artifacts/releases/utils; typed loaders for config and documents ([b4e5954](https://github.com/serverlessinbox/artifact-registry/commit/b4e59546ce8a30b8770044a60509c0bc3da770aa))

* commands and plugin create their S3 clients and use typed loaders ([7a2e44a](https://github.com/serverlessinbox/artifact-registry/commit/7a2e44a430165030cbc8dd74444ff0c393f9caff))

* public surface via folder indexes and an exports map; export only what consumers use ([6b1ee17](https://github.com/serverlessinbox/artifact-registry/commit/6b1ee17bbb02f1a7705553e460176ed8500dea9a))

* public surface via folder indexes and an exports map; TS-source entry points ([127b1c4](https://github.com/serverlessinbox/artifact-registry/commit/127b1c487ff825a8ccfbe4be039f260ea3ab26b8))

* zip with fflate (keeps directory structure) instead of spawning the zip binary ([71f785f](https://github.com/serverlessinbox/artifact-registry/commit/71f785f339a6e8ba4f9a22a149c029b34496ff8c))

* async loaders and I/O; workspace config is artifact-registry.json ([6be4455](https://github.com/serverlessinbox/artifact-registry/commit/6be4455465a147f8232bfb2826264650538b3a83))

* one config file name, no major.x template copies, versions without v ([0ab9ece](https://github.com/serverlessinbox/artifact-registry/commit/0ab9ece988807036228a6928e848bc2befc0c00f))

* move the gitversion plugin into @serverlessinbox/artifact-registry-gitversion ([889951c](https://github.com/serverlessinbox/artifact-registry/commit/889951c587e8cb52488fa60d0a24fd6a1d99101d))

* drop unused registry surface and dead prerelease loader ([cfdd33c](https://github.com/serverlessinbox/artifact-registry/commit/cfdd33ce6bd4aae53769697ca6ef0d2315d0e0ea))

### docs

* Updated readme's ([5ddb869](https://github.com/serverlessinbox/artifact-registry/commit/5ddb86964ebfa441ed38e214718598381c69d4fc))

* core comments describe the concept without naming gitversion ([764fc3c](https://github.com/serverlessinbox/artifact-registry/commit/764fc3ced645b6a512f7594495d3807242143b89))

* READMEs describe the multi-region model and the current CLI ([0412f8e](https://github.com/serverlessinbox/artifact-registry/commit/0412f8e01df4449f1bf3e15b953cee109c7e7e86))

* every type states its purpose; drop the wrong publish comment in .gitversion.cjs ([d3c5895](https://github.com/serverlessinbox/artifact-registry/commit/d3c589574d24aef876608b6b8ca753d038100bd2))

### feat

* registry location (bucketBase, project, per-region bucket overrides) and region targets in artifact-registry.json ([e5164a4](https://github.com/serverlessinbox/artifact-registry/commit/e5164a4530193309019d87e356ce94077c1b88e3))

* RegionalPublisher publishes to every region, objects before pointers, with per-region failure reporting ([91ad4db](https://github.com/serverlessinbox/artifact-registry/commit/91ad4db715cdad5d48367307f930943ede348916))

* readers resolve artifacts per region from the registry location ([96875e6](https://github.com/serverlessinbox/artifact-registry/commit/96875e6f3e4c75956b1e91bb50915b0e375b7e2f))

* CLI publishes to every region of the registry location ([91ab683](https://github.com/serverlessinbox/artifact-registry/commit/91ab683ae9461db5802f3a0f233d032029a7dd37))

* drop publish manifest and getVersionId; build requires --output ([b246ee7](https://github.com/serverlessinbox/artifact-registry/commit/b246ee7727a21db799999e87e7e6df98f35acd49))

* gitversion plugin publishes every file to all regions, pointers after the last file ([5e4ca02](https://github.com/serverlessinbox/artifact-registry/commit/5e4ca02e5606218bfc5e4e9a0fa2942d646b55c9))

### fix

* CLI is named artifact-registry, reports its own version, and rejects colliding basenames ([0d5a0d8](https://github.com/serverlessinbox/artifact-registry/commit/0d5a0d899246513b1d84f2c3d5ed1e616cc2477a))
