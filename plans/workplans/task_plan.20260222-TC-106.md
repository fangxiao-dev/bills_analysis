# Task Plan: 20260222-TC-106

## Goal
Implement office receiver city-based configuration so users select city in Upload UI and backend resolves expected receiver name/address from one extensible mapping source.

## Scope
- TC-106: office receiver城市化：Upload选择城市，按配置自动匹配地址并参与receiver校验（地址只读、可扩展mapping）
- In-scope:
  - Add backend single-source config for office city -> address mapping.
  - Build expected receiver name from fixed prefix/suffix plus selected city.
  - Add Upload page office-only city selector and read-only address display.
  - Keep default behavior equivalent to `Ramen Ippin Dortmund GmbH` + `Reinoldistr.8, 44135 Dortmund`.
  - Persist selected city via upload metadata for per-batch receiver validation.
- Out-of-scope:
  - Editing receiver address in UI.
  - Breaking changes to existing `v1` request/response contracts.

## Delivery Milestones
### Milestone 1: Config and backend resolution
- Add extensible config file for receiver city/address mapping.
- Add shared resolver used by office receiver checks.
- Keep env fallback path for compatibility.
- **Status:** pending

### Milestone 2: API and frontend selection flow
- Add read-only API for receiver options.
- Load options in Upload flow.
- Add office city selector and read-only address display.
- Attach selected city to `metadata_json` on upload submit.
- **Status:** pending

### Milestone 3: Validation and documentation
- Add/adjust backend and frontend tests.
- Update user/developer docs for new config workflow.
- **Status:** pending
