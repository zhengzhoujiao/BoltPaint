import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.models import ArtworkCreate, PricingStrategyCreate, PricingStrategyUpdate, get_strategy_resolutions
from app.routers import generate, image_models, pricing


class PricingResolutionTests(unittest.IsolatedAsyncioTestCase):
    def test_resolution_configuration_validation(self):
        self.assertEqual(PricingStrategyCreate(name="Custom", supported_resolutions=["2K"]).supported_resolutions, ["2K"])
        for schema, kwargs in [(PricingStrategyCreate, {"name": "Custom"}), (PricingStrategyUpdate, {})]:
            for invalid in [[], ["8K"]]:
                with self.assertRaises(ValidationError):
                    schema(**kwargs, supported_resolutions=invalid)

    def test_legacy_defaults_and_explicit_override(self):
        legacy = {"id": "GPTImage2", "name": "GPT", "model_id": "gpt-image-2-beta"}
        self.assertEqual(pricing._doc_to_pricing_strategy(legacy).supported_resolutions, ["1K"])
        self.assertEqual(get_strategy_resolutions({**legacy, "supported_resolutions": ["2K", "4K"]}), ["2K", "4K"])
        self.assertEqual(get_strategy_resolutions({"model_id": "nano-banana-pro-beta"}), ["1K", "2K", "4K"])

    async def test_model_response_uses_pricing_configuration(self):
        db = SimpleNamespace(pricing_strategies=SimpleNamespace(find_one=AsyncMock(return_value={"supported_resolutions": ["2K"], "price_2k": 12})))
        result = await image_models._get_model_with_pricing({"id": "nano-banana-pro-beta", "pricing_strategy_id": "Custom"}, db)
        self.assertEqual(result["supported_resolutions"], ["2K"])
        self.assertEqual(result["price_2k"], 12)

    async def test_update_persists_resolution_configuration(self):
        strategy = {"id": "Custom", "name": "Custom", "model_id": "nano-banana-pro-beta"}
        db = SimpleNamespace(pricing_strategies=SimpleNamespace(
            find_one=AsyncMock(side_effect=[strategy, {**strategy, "supported_resolutions": ["1K", "4K"]}]),
            update_one=AsyncMock(),
        ))
        with patch.object(pricing, "get_database", return_value=db):
            result = await pricing.update_pricing_strategy("Custom", PricingStrategyUpdate(supported_resolutions=["1K", "4K"]), "admin")
        self.assertEqual(result.supported_resolutions, ["1K", "4K"])
        self.assertEqual(db.pricing_strategies.update_one.call_args.args[1]["$set"]["supported_resolutions"], ["1K", "4K"])

    async def test_unsupported_resolution_is_rejected_before_deduction(self):
        db = SimpleNamespace(
            users=SimpleNamespace(find_one=AsyncMock(return_value={"balance_beans": 100}), find_one_and_update=AsyncMock()),
            image_models=SimpleNamespace(find_one=AsyncMock(return_value={"enabled": True, "pricing_strategy_id": "Custom"})),
            pricing_strategies=SimpleNamespace(find_one=AsyncMock(return_value={"id": "Custom", "model_id": "nano-banana-pro-beta", "supported_resolutions": ["1K"]})),
            tasks=SimpleNamespace(insert_one=AsyncMock()),
        )
        request = ArtworkCreate(user_input_prompt="test", aspect_ratio="1:1", resolution="2K", model_id="nano-banana-pro-beta")
        with patch.object(generate, "get_database", return_value=db), patch.object(generate, "get_dynamic_setting", new=AsyncMock(return_value=False)):
            with self.assertRaises(HTTPException) as caught:
                await generate.generate_image(request, "user")
        self.assertEqual(caught.exception.status_code, 400)
        db.users.find_one_and_update.assert_not_awaited()
        db.tasks.insert_one.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
