
# Changelog

All notable changes to this project will be documented in this file


## [0.3.3](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.2...v0.3.3) (Mon Oct 12 2026)

### docs

* Added mermaid diagrams ([2173753](https://github.com/serverlessinbox/artifact-registry/commit/217375307f0f937140d25442456db1f635382125))

## [0.3.2](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.1...v0.3.2) (Mon Oct 12 2026)



## [0.3.1](https://github.com/serverlessinbox/artifact-registry/compare/v0.3.0...v0.3.1) (Mon Oct 12 2026)

### docs

* Updated readme to follow the new cdk package ([433f280](https://github.com/serverlessinbox/artifact-registry/commit/433f2808c6a01dbf3e2cd9bcf997f62771da2b32))

## [0.3.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.2.0...v0.3.0) (Sun Oct 11 2026)



## [0.2.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.3...v0.2.0) (Fri Oct 09 2026)

### refactor

* core ./resolution subpath with the resolver closure, free of S3/esbuild ([8804cc0](https://github.com/serverlessinbox/artifact-registry/commit/8804cc00ec7410803d80e8750d8119106f40f775))

* remove core IArtifactResolver and ArtifactResolver.getLocation() ([385ea8d](https://github.com/serverlessinbox/artifact-registry/commit/385ea8d62c1d6dc58eb512d65bf865c2656fb058))

### feat

* resolve-artifacts takes a zone per component and writes { version, zone } ([eb9286d](https://github.com/serverlessinbox/artifact-registry/commit/eb9286d31ba907a9f880bd0789c54e833eeb5c85))

### test

* one typed S3 body helper; fixes 9 suites that only passed from the jest cache ([41ed427](https://github.com/serverlessinbox/artifact-registry/commit/41ed427135c8e52afb32e040093e2f260f68843c))

## [0.1.3](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.2...v0.1.3) (Tue Oct 06 2026)



## [0.1.2](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.1...v0.1.2) (Tue Oct 06 2026)

### feat

* registry record type, loader and registry-record fetch|check commands ([97b39fe](https://github.com/serverlessinbox/artifact-registry/commit/97b39fe03b096b02ab01be5f964685d04555dd0d))

* Added region flag to check registry records ([73ba27d](https://github.com/serverlessinbox/artifact-registry/commit/73ba27d5807313ce26199cad3567d59272552b85))

### refactor

* one class per file (RegionPublishError, ArtifactResolver), enforced by lint ([ff157d6](https://github.com/serverlessinbox/artifact-registry/commit/ff157d6f949824692a8a8a81a4dbd4854b6d9928))

* imports follow the registry module ([c98b9a5](https://github.com/serverlessinbox/artifact-registry/commit/c98b9a53eeaffc17a71ae95964ba083e24d4c5dc))

* registry subpath export (@serverlessinbox/artifact-registry/registry), loader split out, unused-code checks on ([363c1e4](https://github.com/serverlessinbox/artifact-registry/commit/363c1e4717395b3610c9317728e47d32b8b6438a))

### test

* one test file per source file; registry record and command tests ([8989cae](https://github.com/serverlessinbox/artifact-registry/commit/8989caeb8ab7b46817c2bac872322a8970a67819))

* registry and record-loader tests follow their sources; registry subpath exports pinned ([3654c02](https://github.com/serverlessinbox/artifact-registry/commit/3654c02b17ec29f31fe8f18ec92fc887440aab7a))

### docs

* registry record and registry-record commands ([cbfbd34](https://github.com/serverlessinbox/artifact-registry/commit/cbfbd3409853b69382ba846bed40219ec28bdbb6))

* registry subpath, check exit codes, pointer access-denied ([b3cddf1](https://github.com/serverlessinbox/artifact-registry/commit/b3cddf1290567e83ac1cb8eb171df98547945ca2))

## [0.1.1](https://github.com/serverlessinbox/artifact-registry/compare/v0.1.0...v0.1.1) (Mon Oct 05 2026)



## [0.1.0](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.37...v0.1.0) (Mon Oct 05 2026)

### chore

* convert artifact-registry into a yarn workspace (packages/artifact-registry) ([4c4de94](https://github.com/serverlessinbox/artifact-registry/commit/4c4de94d3e907a94d0ee4823280acdf2db8cfed3))

* publish readiness (clean dist, engines, repository, release from main only) ([ef415d3](https://github.com/serverlessinbox/artifact-registry/commit/ef415d35b5f72af47a02c1cd21c291ed1e0a1c02))

### refactor

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

## [0.0.37](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.36...v0.0.37) (Mon Jul 13 2026)

### feat

* Templated release urls ([0828eea](https://github.com/serverlessinbox/artifact-registry/commit/0828eea6502109baa6244d8569b7f3b78cd30471))

## [0.0.36](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.35...v0.0.36) (Thu Jul 09 2026)

### feat

* Release pointer parsing ([3073a6a](https://github.com/serverlessinbox/artifact-registry/commit/3073a6a313eaa573a52b73caed7b5608aa2b0538))

## [0.0.35](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.34...v0.0.35) (Wed Jul 08 2026)

### feat

* Removed cf custom resource logic ([77b1d02](https://github.com/serverlessinbox/artifact-registry/commit/77b1d02f19996add2a4856a51e5965b9a331aab1))

## [0.0.34](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.33...v0.0.34) (Tue Jul 07 2026)

### fix

* Added miissing region ([68923b9](https://github.com/serverlessinbox/artifact-registry/commit/68923b9c1b6ba31ec56591529a07713f09d496d8))

## [0.0.33](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.32...v0.0.33) (Mon Jul 06 2026)

### fix

* Artifact resolver handler with cfn response ([853a9fd](https://github.com/serverlessinbox/artifact-registry/commit/853a9fd712ba02a0f843734f9f3866a416d22160))

* Not found now throws ([b2b4f91](https://github.com/serverlessinbox/artifact-registry/commit/b2b4f9162bfac3902a822a2300f5b6c5468760ba))

## [0.0.32](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.31...v0.0.32) (Mon Jul 06 2026)

### fix

* Artifact registry update ([539a1d2](https://github.com/serverlessinbox/artifact-registry/commit/539a1d26a227cef78b14c3824482beb49e822288))

## [0.0.31](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.30...v0.0.31) (Mon Jul 06 2026)

### fix

* Put back the latest stable pointer ([922995f](https://github.com/serverlessinbox/artifact-registry/commit/922995fb6e5cc3ec10917064688373d1ae953af8))

## [0.0.30](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.29...v0.0.30) (Mon Jul 06 2026)

### feat

* Added loggin and track resolver handler size stripping ([701f865](https://github.com/serverlessinbox/artifact-registry/commit/701f86592d0321a6679082a86358baa06eb98d1f))

## [0.0.29](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.28...v0.0.29) (Mon Jul 06 2026)

### fix

* Dynamic track loading tweaks ([418021f](https://github.com/serverlessinbox/artifact-registry/commit/418021ffe7e639849b4891d4504330c9db99eafc))

## [0.0.28](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.27...v0.0.28) (Sun Jul 05 2026)

### feat

* Prefix keys with project and track resolver ([27341d4](https://github.com/serverlessinbox/artifact-registry/commit/27341d45b7b1d7201765cf9614d0632913ce3eb2))

## [0.0.27](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.26...v0.0.27) (Wed Jun 24 2026)

### fix

* Use correct release targets ([5e15759](https://github.com/serverlessinbox/artifact-registry/commit/5e157592012c5d56c9103f7037d678c0a1c0e5ce))

## [0.0.26](https://github.com/serverlessinbox/artifact-registry/compare/v0.0.25...v0.0.26) (Tue Jun 23 2026)

### fix

* Yarn config ([8cf7f6f](https://github.com/serverlessinbox/artifact-registry/commit/8cf7f6f2fbfbb0cb1398ec30c20e6c3cb9b961a0))

### feat

* Load track and load prerelease ([28ab3b3](https://github.com/serverlessinbox/artifact-registry/commit/28ab3b3a7a76eddf4b7d053142848ed251e98898))

## [0.0.25](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.24...v0.0.25) (Thu Jun 18 2026)

### feat

* Changed package name ([b1096f5](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/b1096f5f4093e095ac8120e69a42e42820aa81f8))

### fix

* Updated yarn config ([88c8701](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/88c870163d3b56211793654025dacc108a0a11f8))

## [0.0.24](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.23...v0.0.24) (Mon Jun 15 2026)

### feat

* Removed bundling ([b35fce6](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/b35fce634d4845381ac86066768a11d84c57a0fa))

### fix

* Added s3VersionMap ([fbc4c02](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/fbc4c02d3eeed94b13b34ba740b19c00e5be4308))

* s3 versions ([469270a](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/469270aecea3e327bb649f7517ab25bf92b7f6f6))

## [0.0.23](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.22...v0.0.23) (Mon Jun 15 2026)

### feat

* Channel handling ([5110d8d](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/5110d8db12fbcc93b22a44f493b34f21bcd2d5d4))

## [0.0.22](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.21...v0.0.22) (Sun Jun 14 2026)

### feat

* Version information retrieval ([b44cf95](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/b44cf95f733efb7f82243b8ace6091f605be5914))

## [0.0.21](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.20...v0.0.21) (Sun Jun 14 2026)

### feat

* Artifact refactor ([745edc7](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/745edc7c61f1217fbe98fe49ef8eedd914a30ca9))

## [0.0.20](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.19...v0.0.20) (Sat Jun 13 2026)

### feat

* Artifact resolvefr ([bb177ac](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/bb177accec24d8f03c5d9ae3b5ed8e46900a7b1c))

## [0.0.19](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.18...v0.0.19) (Fri Jun 12 2026)

### feat

* Bucket functions ([746d5a1](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/746d5a18c072af6b768fe7b5cfb7b76c8479dd6e))

## [0.0.18](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.17...v0.0.18) (Fri Jun 12 2026)

### feat

* Artifact registry ([82575d0](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/82575d0b4afed2a18f8b5fbbf7109197ee94b5c1))

## [0.0.17](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.16...v0.0.17) (Thu Jun 11 2026)

### fix

* Channel handling ([0735f54](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/0735f549b780d99e01c4e55e084b25e5d9fd9297))

## [0.0.16](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.15...v0.0.16) (Thu Jun 11 2026)

### feat

* Added track logic for templates ([5391235](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/5391235dcbd19ec1ba5a563480f4503bf70d230e))

## [0.0.15](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.14...v0.0.15) (Wed Jun 10 2026)

### feat

* Artifact handling ([003c10b](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/003c10bf19412a29a3e8542271055a2f7d5b5579))

## [0.0.14](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.13...v0.0.14) (Wed Jun 10 2026)

### feat

* Resolving artifacts ([ddad41c](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/ddad41c4f141d202cf1975f3cd0fb7a514de03a7))

## [0.0.13](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.12...v0.0.13) (Wed Jun 10 2026)

### feat

* Removed check artifacts command ([75ede21](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/75ede2180dd8fa3c5544020d0e06f183f07db23a))

## [0.0.12](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.11...v0.0.12) (Wed Jun 10 2026)

### feat

* Check command ([8577c75](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/8577c759bd623525d1fd2a377991475772a9c65c))

## [0.0.11](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.10...v0.0.11) (Wed Jun 10 2026)

### feat

* Integrated artifact handling ([3ce1888](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/3ce1888691dc324db24df46ec1eeec303ee9b088))

## [0.0.10](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.9...v0.0.10) (Sat Jun 06 2026)

### fix

* Updated readme ([1d33cdb](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/1d33cdbd256933cdd6892238658eb01f813244fd))

## [0.0.9](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.8...v0.0.9) (Sat Jun 06 2026)

### feat

* updated plugin to output meta data ([e280867](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/e2808676561fde3bf2400e1ce3dbf89346b95310))

## [0.0.8](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.7...v0.0.8) (Sat Jun 06 2026)

### feat

* temp fix with sidecar ([a7bb558](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/a7bb5580a11263df58459f6174e45c16298a88a8))

## [0.0.7](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.6...v0.0.7) (Sat Jun 06 2026)

### feat

* temporatry publish in first job ([a11debb](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/a11debb35eb5499da5e0b8f1b97ff11bb3840be3))

* temp publish pipeline ([a891ef3](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/a891ef311ce50a0491164de82cef966afaeb4976))

* Plugin config from package ([0ba8cb6](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/0ba8cb67a2dd20da75b70aed38b193620d9833af))

* Also tag rights ([a45cbc4](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/a45cbc4b7b7178108cebc37e0a026de9a81acb00))

## [0.0.5](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.4...v0.0.5) (Tue Jun 02 2026)

### feat

* Added version files and extracted logic for other packages ([2670f73](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/2670f73795d6ed99a43690b2543c5ffdd65e58d0))

## [0.0.4](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.3...v0.0.4) (Mon Jun 01 2026)

### feat

* Added package name ([571daf0](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/571daf0dbcb1d96d85a1717fd447236c9a72c635))

### fix

* Fixed tsc errors ([5324aa7](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/5324aa7cca46fd955009e3f70c7654841d12c1bb))

* Added bump ([4d7a092](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/4d7a092a01434faec09b3f98cee450f855156fe8))

* Publish config ([c7c33d3](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/c7c33d3afdfc8c6277a1fcc278f573d8fd9587bb))

## [0.0.3](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.2...v0.0.3) (Tue May 26 2026)

### fix

* Esmodule to commonjs ([dbcb135](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/dbcb1352bdc36842a201f40b94c1b76c3c53da7a))

## [0.0.2](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.1...v0.0.2) (Tue May 26 2026)

### feat

* Added readme ([c5aca4a](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/c5aca4ad3b3c7aad0166fd4fc47de1912398914b))

## [0.0.1](https://github.com/serverlessinbox/gitversion-plugin-s3/compare/v0.0.0...v0.0.1) (Tue May 26 2026)

### feat

* full plugin ([1f96479](https://github.com/serverlessinbox/gitversion-plugin-s3/commit/1f96479e4cb3a8ec7af646a93e75202bb9a21204))
