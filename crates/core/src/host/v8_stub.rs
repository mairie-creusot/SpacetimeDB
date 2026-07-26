//! PawChat-trimmed build: stand-in for `host::v8` when the `js-host` Cargo
//! feature is disabled.
//!
//! The real module (`host/v8/mod.rs` and friends) wraps the `v8` crate, a
//! Rust binding to the V8 C++ JavaScript engine, used only to run modules
//! authored in JS/TypeScript. PawChat always publishes a Rust-compiled WASM
//! module, so that code path is never exercised.
//!
//! This stub keeps the exact public type/method surface the rest of the
//! crate (`host_controller.rs`, `module_host.rs`, `worker_metrics/mod.rs`)
//! expects, so none of that code needs to change. The only reachable path is
//! `V8Runtime::make_actor`, which fails fast with a clear error instead of
//! silently doing nothing. Every other method here is unreachable in
//! practice, because a `JsModule`/`JsMainInstance`/`JsProcedureInstance` is
//! never actually constructed when this stub is in effect.

use super::host_controller::CallProcedureReturn;
use super::module_host::{
    CallHttpHandlerParams, CallReducerParams, ClientConnectedError, HttpHandlerCallError, ModuleInfo,
    ModuleWithInstance, OneOffQueryRequest, SqlCommand, SqlCommandResult, ViewCommand, ViewCommandMetric,
    ViewCommandResult,
};
use super::scheduler::{CallScheduledFunctionResult, ScheduledFunctionParams};
use super::{ReducerCallError, ReducerCallResult, Scheduler};
use crate::client::ClientActorId;
use crate::config::V8Config;
use crate::host::UpdateDatabaseResult;
use crate::module_host_context::ModuleCreationContext;
use crate::replica_context::ReplicaContext;
use crate::util::jobs::AllocatedJobCore;
use spacetimedb_auth::identity::ConnectionAuthCtx;
use spacetimedb_lib::{ConnectionId, Identity};
use spacetimedb_schema::auto_migrate::MigrationPolicy;
use std::sync::Arc;

/// The V8 runtime, disabled in this build.
#[derive(Clone, Copy, Default)]
pub struct V8Runtime {
    _config: V8Config,
}

impl V8Runtime {
    pub fn new(config: V8Config) -> Self {
        Self { _config: config }
    }

    pub async fn make_actor(
        &self,
        _mcc: ModuleCreationContext,
        _program_bytes: &[u8],
        _core: AllocatedJobCore,
    ) -> anyhow::Result<ModuleWithInstance> {
        anyhow::bail!(
            "this SpacetimeDB build was compiled without JS/TypeScript module support \
             (`js-host` Cargo feature disabled); only WASM modules (e.g. compiled from Rust or C#) are supported"
        )
    }
}

pub(in crate::host) struct V8HeapMetrics;

impl V8HeapMetrics {
    pub(in crate::host) fn remove_all_metric_label_values_for_database(_database_identity: &Identity) {}
}

#[derive(Copy, Clone)]
pub enum JsWorkerKind {
    Main,
    Procedure,
}

impl AsRef<str> for JsWorkerKind {
    fn as_ref(&self) -> &str {
        match self {
            Self::Main => "main",
            Self::Procedure => "procedure",
        }
    }
}

/// Never actually constructed: [`V8Runtime::make_actor`] always errors before
/// producing one of these.
#[derive(Clone)]
pub struct JsModule {
    _unconstructible: std::convert::Infallible,
}

impl JsModule {
    pub fn replica_ctx(&self) -> &Arc<ReplicaContext> {
        match self._unconstructible {}
    }

    pub fn scheduler(&self) -> &Scheduler {
        match self._unconstructible {}
    }

    pub fn info(&self) -> Arc<ModuleInfo> {
        match self._unconstructible {}
    }

    pub(in crate::host) fn metrics(&self) -> super::module_host::InstanceManagerMetrics {
        match self._unconstructible {}
    }

    pub(in crate::host) fn procedure_instance_pool_size(&self) -> std::num::NonZeroUsize {
        match self._unconstructible {}
    }

    pub async fn create_instance(&self) -> JsProcedureInstance {
        match self._unconstructible {}
    }
}

pub type JsFatalHook = Arc<dyn Fn() + Send + Sync + 'static>;

#[derive(Clone)]
pub struct JsMainInstance {
    _unconstructible: std::convert::Infallible,
}

impl JsMainInstance {
    pub async fn update_database(
        &self,
        _program: spacetimedb_datastore::traits::Program,
        _old_module_info: Arc<ModuleInfo>,
        _policy: MigrationPolicy,
    ) -> anyhow::Result<UpdateDatabaseResult> {
        match self._unconstructible {}
    }

    pub async fn call_reducer(&self, _params: CallReducerParams) -> ReducerCallResult {
        match self._unconstructible {}
    }

    pub(in crate::host) async fn call_scheduled_reducer(
        &self,
        _params: ScheduledFunctionParams,
    ) -> CallScheduledFunctionResult {
        match self._unconstructible {}
    }

    pub(in crate::host) async fn enqueue_reducer(&self, _params: CallReducerParams, _on_panic: JsFatalHook) {
        match self._unconstructible {}
    }

    pub async fn clear_all_clients(&self) -> anyhow::Result<()> {
        match self._unconstructible {}
    }

    pub async fn call_identity_connected(
        &self,
        _caller_auth: ConnectionAuthCtx,
        _caller_connection_id: ConnectionId,
    ) -> Result<(), ClientConnectedError> {
        match self._unconstructible {}
    }

    pub async fn call_identity_disconnected(
        &self,
        _caller_identity: Identity,
        _caller_connection_id: ConnectionId,
    ) -> Result<(), ReducerCallError> {
        match self._unconstructible {}
    }

    pub async fn disconnect_client(&self, _client_id: ClientActorId) -> Result<(), ReducerCallError> {
        match self._unconstructible {}
    }

    pub async fn init_database(
        &self,
        _program: spacetimedb_datastore::traits::Program,
    ) -> anyhow::Result<Option<ReducerCallResult>> {
        match self._unconstructible {}
    }

    pub async fn call_view(&self, _cmd: ViewCommand) -> ViewCommandResult {
        match self._unconstructible {}
    }

    pub(in crate::host) async fn enqueue_call_view(
        &self,
        _cmd: ViewCommand,
        _metric: ViewCommandMetric,
        _on_panic: JsFatalHook,
    ) {
        match self._unconstructible {}
    }

    pub(in crate::host) async fn call_sql(&self, _cmd: SqlCommand) -> SqlCommandResult {
        match self._unconstructible {}
    }

    pub(in crate::host) async fn enqueue_one_off_query(&self, _request: OneOffQueryRequest, _on_panic: JsFatalHook) {
        match self._unconstructible {}
    }
}

pub struct JsProcedureInstance {
    _unconstructible: std::convert::Infallible,
}

impl JsProcedureInstance {
    pub(in crate::host) fn is_closed(&self) -> bool {
        match self._unconstructible {}
    }

    pub async fn call_procedure(&self, _params: super::module_host::CallProcedureParams) -> CallProcedureReturn {
        match self._unconstructible {}
    }

    pub async fn call_http_handler(
        &self,
        _params: CallHttpHandlerParams,
    ) -> Result<(spacetimedb_lib::http::Response, bytes::Bytes), HttpHandlerCallError> {
        match self._unconstructible {}
    }

    pub(in crate::host) async fn enqueue_procedure(
        &self,
        _params: super::module_host::CallProcedureParams,
    ) -> JsProcedureCall {
        match self._unconstructible {}
    }

    pub(in crate::host) async fn call_scheduled_procedure(
        &self,
        _params: ScheduledFunctionParams,
    ) -> CallScheduledFunctionResult {
        match self._unconstructible {}
    }
}

pub(in crate::host) struct JsProcedureCall {
    _unconstructible: std::convert::Infallible,
}

pub(in crate::host) enum JsProcedureCallCompletion {
    Completed(CallProcedureReturn),
    Panicked,
    WorkerExited,
}

impl JsProcedureCall {
    pub(in crate::host) async fn receive(self) -> JsProcedureCallCompletion {
        match self._unconstructible {}
    }
}
