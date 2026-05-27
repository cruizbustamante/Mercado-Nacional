import { OcModal } from "./OcModal";

export default function ModalLoading() {
  return (
    <OcModal id="">
      <div className="oc-modal-skeleton">
        <div className="sk-row sk-row-big" />
        <div className="sk-row" />
        <div className="sk-row" />
        <div className="sk-table">
          <div className="sk-row" />
          <div className="sk-row" />
          <div className="sk-row" />
          <div className="sk-row" />
          <div className="sk-row" />
        </div>
      </div>
    </OcModal>
  );
}
