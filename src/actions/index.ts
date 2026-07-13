import { demoLogin, login, logout } from "./auth";
import { createPage, updatePage } from "./pages";
import { addAssetRelationship, createAsset, decommissionAsset, updateAsset } from "./assets";
import { createCredential, revealCredential } from "./credentials";

export const server = {
  login,
  logout,
  demoLogin,
  createPage,
  updatePage,
  createAsset,
  updateAsset,
  decommissionAsset,
  addAssetRelationship,
  createCredential,
  revealCredential,
};
