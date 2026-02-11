export default function ProfilePatch({ name, imageUrl }) {
  const initial = name?.charAt(0).toUpperCase() || "?";
  return (
    <div className="profile-patch">
      <div className="profile-patch-inner">
        {imageUrl ? (
          <img src={imageUrl} alt={name || "Profile"} className="profile-patch-img" />
        ) : (
          <span className="profile-patch-initial">{initial}</span>
        )}
      </div>
    </div>
  );
}
