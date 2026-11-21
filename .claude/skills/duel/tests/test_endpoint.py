"""Otra direccion para el critico (FreeLLMAPI u otra compatible con Responses)."""
import os, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import duel


class Endpoint(unittest.TestCase):
    def setUp(self):
        self.antes = {k: os.environ.pop(k, None) for k in ("DUEL_ENDPOINT", "DUEL_API_KEY", "OPENAI_API_KEY")}

    def tearDown(self):
        for k, v in self.antes.items():
            os.environ.pop(k, None)
            if v is not None:
                os.environ[k] = v

    def test_sin_nada_es_openai(self):
        self.assertEqual(duel.configured_endpoint(), duel.API_ENDPOINT)

    def test_completa_la_ruta(self):
        self.assertEqual(duel.configured_endpoint("https://mi.servidor"), "https://mi.servidor/v1/responses")
        self.assertEqual(duel.configured_endpoint("https://mi.servidor/v1/"), "https://mi.servidor/v1/responses")
        self.assertEqual(duel.configured_endpoint("https://mi.servidor/v1/responses"), "https://mi.servidor/v1/responses")

    def test_solo_https_salvo_la_propia_maquina(self):
        with self.assertRaises(duel.DuelError):
            duel.configured_endpoint("http://mi.servidor/v1")
        self.assertEqual(duel.configured_endpoint("http://localhost:3001"), "http://localhost:3001/v1/responses")
        for malo in ("https://u:p@mi.servidor", "https://mi.servidor/v1?x=1", "ftp://mi.servidor"):
            with self.assertRaises(duel.DuelError):
                duel.configured_endpoint(malo)

    def test_la_clave_de_otra_direccion(self):
        otra = "https://mi.servidor/v1/responses"
        os.environ["OPENAI_API_KEY"] = "sk-openai"
        os.environ["DUEL_API_KEY"] = "clave-propia"
        self.assertEqual(duel.configured_key(otra), "clave-propia")
        self.assertEqual(duel.configured_key(duel.API_ENDPOINT), "sk-openai")
        del os.environ["DUEL_API_KEY"]
        self.assertEqual(duel.configured_key(otra), "sk-openai")


if __name__ == "__main__":
    unittest.main()
