export default function Navbar({ night, onToggleNight }) {
  return (
    <div className="navbar">
      <div className="left">
        <div className="logo">spanSense</div>
      </div>
      <div className="right">
        <div className="night-mode-toggle" onClick={onToggleNight}>
          <i className={`fas ${night ? 'fa-sun' : 'fa-moon'}`}></i>
        </div>
        <div className="account-links">
          <a href="../accounts/accounts.html" title="Account"><i className="fas fa-user-circle"></i></a>
          <a href="../contacts/contacts.html" title="Contact Us"><i className="fas fa-envelope"></i></a>
        </div>
      </div>
    </div>
  );
}
