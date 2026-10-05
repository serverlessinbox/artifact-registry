
# Changelog

All notable changes to this project will be documented in this file


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
